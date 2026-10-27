# План 12c: «Хто я?» — кожен відкриває підказки сам

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12c специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md` (розділ 7; обмеження — розділи 2 і 3; рядок «Хто я?» у таблиці живих виборів 12b — розділ 6, п. 3; рішення автора — розділ 18). Рішення власника: кожна підказка, яку гравець відкрив, знижує ціну саме для нього; таймер спільний.
- **Редактор.** У запитанні «Хто я?» перемикач «Підказки відкриваються: за таймером / кожен сам». «Кожен сам» ховає інтервал і підказку про час, правило «остання підказка встигає до кінця» не діє, але таймер — щонайменше 20 с. На усній клітинці поля під перемикачем написано, що підказки однаково відкриває ведучий.
- **Телефон.** Спершу видно першу підказку. Кнопка «Ще підказка · ціна стане 60 %» відкриває наступну. Рядок «Підказка 2 з 5: правильна відповідь зараз — 80 % ціни» лишається лічильником. Закрити підказку не можна. Після «Відповісти», на паузі, на заставці й після кінця часу кнопки немає або вона вимкнена. Після перепідключення гравець бачить свої відкриті підказки.
- **Ціна.** `clueShare(n, скільки відкрив цей гравець у мить відповіді)`. Хто не відповів — 0, як зараз. Додатковий час нових підказок не відкриває.
- **Сцена** не підглядає: показує лише першу підказку й рядок «Оля 1 · Петро 3 · Іра 2». На розкритті показує всі підказки й рядок «Оля — на підказці 1 · Петро — на підказці 3 · Іра — без відповіді».
- **Пульт.** «Хто я?» показує всі підказки з рядком «хто скільки відкрив». У «Відповідях наживо» біля кожного — «підказка 3/5» (поступ зі стану гри, як ланцюжок чи стіна; це рядок «Хто я?» у власному темпі, який 12b залишила для 12c).
- **Команди.** Підказки відкриває той, хто відповідає за команду (`actorOf(…, 'answer')`: зараз капітан, з 12g — відповідач). Товариші бачать ті самі підказки.
- **Гра без ведучого** працює без змін: гравці відкривають самі.
- **Довідка ведучого:** запис `question.clues` (`help/questions.ts`): новий режим, ціна, 20 с, де не діє.

**Стан гри змінюється: `GAME_STATE_VERSION` 15 → 16.**
- Нове необов'язкове поле `Play.clueOpens?: Record<string, number>`: скільки підказок відкрив кожен гравець (у командній грі — команда). Число живе в стані гри, бо від нього залежать бали, і воно має пережити перезапуск (п. 10 специфікації). Тест форми стану (`restore.test.ts`, `KEYS`) вимагає нової версії для нового ключа `Play`.
- `READABLE_STATE_VERSIONS` отримує 15. Стан версій 2–15 не може містити «Хто я?» у власному темпі: поля `cluePace` тоді не було, а без `clueOpens` у кожного 1 підказка. Тож кімната, збережена до розгортання 12c, відновлюється без перетворень, і живі ігри деплой переживають. Перед пушем — звичне правило перевірки `live_room`.
- Нове поле запитання `cluePace` — необов'язкове, без нього все як зараз. Старі вікторини проходять перевірку без міграції. Бази даних план не змінює: рекордер і `answer` без змін.

**Архітектура:**
- **Shared.**
  - `quiz.ts`: `CLUE_PACES`, `CluePace`, необов'язкове `cluePace` у запитанні `clues`, `LIMITS.selfCluesMinTime = 20`. `interval` отримує типове значення (`LIMITS.defaultClueSeconds`), тож запитання без інтервалу проходить. У `superRefine`: для `self` — `clues_self_time` замість `clues_time`. Нова функція `isSelfPaced(question)`.
  - `views.ts`: `ClueOpen`; `PublicClues` + `self`, `opens`; `LiveProgress` + `{ kind: 'clues'; opened; total }`.
  - `events.ts`: `'player:clue': (ack: Ack) => void`.
- **Рушій.**
  - `game.ts`: `Play.clueOpens`. Чотири місця підрахунку балів (`submitAnswer`, `acceptAnswer`, `overrideBoard`, `override`) беруть кількість підказок через `cluesPaid(play, playerId)`.
  - `clues.ts`: `cluesBySelf`, `cluesOpenBy`, `cluesSeenBy`, `cluesPaid`, `openClue`. `nextClueAt` і `openDueClues` у власному темпі нічого не відкривають. `cluesAnswered` отримує `playerId`.
  - `restore.ts`: версія 16.
  - `views.ts`: `publicClues` додає `self` і `opens`; власний зріз гравця (`buildOwnView`) підставляє свої підказки. `live.ts`: `progressOf` дає поступ `clues`; `responseClue` бере число гравця.
- **Сервер.** `rooms/manager.ts`: `clue(room, playerId)` (дія `answer`). `socket.ts`: `player:clue` для ролі `player`.
- **Веб.**
  - Редактор: `QuestionEditor.tsx` (перемикач), `draft.ts` (перевірка, `problemCluesSelfTime`), `draft-storage.ts`.
  - Телефон: `PlayerScreen.tsx` (`CluesNow` з кнопкою «Ще підказка», підказка типу для власного темпу).
  - Сцена й пульт: новий `ClueOpens.tsx`; `StageScreen.tsx`, `HostScreen.tsx` (`HostClues`), `LiveAnswers.tsx` (поступ `clues`).
  - Тексти — `i18n.ts`, стилі — `styles.css`.
- **Довідка ведучого:** `help/questions.ts`, запис `clues`.
- **Наскрізні тести.** Один сценарій «part 12c: …». Редактор на 375 px, пульт на телефоні 375 × 812, сцена 1280 × 720, три телефони 375 × 812. Кадри з префіксом `p12c-`.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Рішення плану там, де специфікація мовчить (координатор може змінити):**

*Схема й редактор*
- `cluePace` — необов'язкове поле (`'timer' | 'self'`). Редактор пише лише `'self'`. Перемикач «за таймером» прибирає ключ зовсім, тож вікторини з таймером не змінюються ні на байт.
- «У режимі `self` інтервал не потрібен»: `interval` лишається в типі `Question` (число), але отримує `.default(LIMITS.defaultClueSeconds)`. Запитання без інтервалу проходить у будь-якому режимі. Так `Question` не стає «інтервал або нічого», і `cluesAt`, пульт і старі стани не змінюються. Межі 3–30 с діють і далі, тож редактор при перемиканні на «кожен сам» замінює непридатний схований інтервал (NaN, поза межами) типовим 8 с.
- Схема не знає способу клітинки. Тому для `self` правило `clues_time` не діє скрізь, а `timeLimit ≥ 20` діє скрізь, і на усній клітинці теж. На усній клітинці 20 с вистачає навіть для 6 підказок: (6 − 1) × 3 + 5 = 20.
- Перемикач на «кожен сам» піднімає час до 20 с, якщо він менший (як `raisedTime` піднімає час за інтервалом).

*Правила рушія*
- `cluesBySelf(play)` — `isSelfPaced(play.question)`, без черги бліцу, не фінал і не усна клітинка (`!cluesByHost(play)`). Решту місць відсіює правило `clues_place`, як і раніше.
- Ключ `clueOpens` — id гравця рушія: гравець у соло, команда в командній грі. На полі відкриває лише той, хто вибрав клітинку (`board.chooserId`). Глядачі поля бачать його підказки, а інші гравці отримують `not_your_turn`.
- `Play.clues` (спільне число) у власному темпі завжди 1: таймер нічого не відкриває. Тому зріз сцени й пульта сам дає першу підказку.
- Помилки `openClue` у такому порядку:
  - `wrong_phase` — не етап `question`, не «Хто я?», не власний темп (зокрема усна клітинка) або гравець відповідає на запасне запитання;
  - `not_found` — гравця немає;
  - `not_your_turn` — на полі не той, хто вибрав клітинку;
  - `already_answered` — є запис, відповідь поля чекає «Прийняти» або є перша спроба;
  - `paused` — пауза або утримання (`heldAt`);
  - `not_started` — ще йде заставка;
  - `time_over` — сплив особистий кінець, а запитання ще відкрите (хтось має додатковий час);
  - `clues_done` — усі підказки відкриті.

  Специфікація перелічує п'ять кодів. Три додаткові (`not_found`, `not_your_turn`, `time_over`) — наявні коди для випадків, яких вона не описує.
- Ціна: `paceFactor(asked, timeMs, cluesPaid(play, playerId))`. Число в мить відповіді збігається з числом після неї, бо після відповіді відкривати не можна. Тож і оцінка ведучого на розкритті (`override`) платить за тим самим числом.

*Хто що бачить*
- Тексти підказок у власному темпі:
  - телефон гравця — лише свої відкриті (команда — підказки команди; глядач поля — підказки того, хто вибрав);
  - сцена до розкриття — лише першу;
  - пульт — усі (`view.correct`, як зараз).
- Список «хто скільки відкрив» (`PublicClues.opens`) отримують сцена й пульт. Телефон отримує `null`: йому список не потрібен, і зріз лишається меншим. До списку входять гравці, що відповідають на основне запитання: на полі — лише той, хто вибрав, а в класиці гравець із запасним (баф «Заміна») не входить. Порядок — `state.players`.
- На розкритті елемент списку з відповіддю — «Оля — на підказці 1», без відповіді — «Іра — без відповіді». До розкриття — лише «Оля 1».

*Пульт і живі вибори 12b*
- Рядок «Відповідей наживо» у власному темпі має поступ `{ kind: 'clues', opened, total }`. Він видимий завжди: `started(row)` — `true`, тож у власному темпі «Чекаємо» порожнє, а кожен рядок стоїть у списку з «підказка 1/5». Так виконано «біля кожного». З відповіддю рядок показує «на підказці N» (наявне `clueAt`) замість «підказка N/5».
- Підказку відкриває гравець, тож вона — не живий вибір: вона не рахується як «змінював N разів» і не йде пакетом `host:drafts`. Рядок оновлюється звичайним зрізом пульта. Згорнута панель («наживо» вимкнено) рядків, як і в 12b, не показує.

*Чого не робимо*
- нового запису в базі: номер підказки в історії не зберігається, і `answer` без нового стовпця (ачівці `own_pace` у 12j знадобиться власне джерело — це її задача);
- зміни сторінок «Як грати» (раунд перелічує типи, а не режими). Змінюється лише підказка типу над першим запитанням на телефоні;
- власного темпу в бліці, фіналі, на бліц-клітинці, в інших раундах (як і раніше, `clues_place`) і на усній клітинці (там відкриває ведучий);
- закриття підказки, «відкрити всі» чи відкриття за гравця ведучим;
- нового демо-вмісту. Тексти e2e — без тем росії й СРСР.

## Глобальні обмеження

- **Анти-ціль:** «старі вікторини змінюють поведінку: … «Хто я?» відкривається інакше». Запитання без `cluePace` йде старим шляхом. Наявні тести `game.clues.test.ts`, `views.clues-pin.test.ts`, сценарій e2e 10c лишаються зеленими без змін очікувань.
- **Анти-ціль:** живі ігри не обриваються деплоєм. Версія 16, а 15 читається (задача 2, `restore.test.ts`; задача 4, `manager.restore.test.ts`).
- **Анти-ціль:** гра без ведучого не зависає. `player:clue` діє в автопілоті так само (задачі 2 і 4).
- **Таємність:** сцена до розкриття не отримує підказок, крім першої; гравець — лише свої. Перевіряють задача 3 (зрізи), задача 4 (зрізи менеджера) і задача 9 (сокетні кадри).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тексти довідки — лише в `apps/web/src/help/*.ts`.
- Сцена 1280 × 720 без прокрутки. Телефон і пульт 375 px без горизонтальної прокрутки сторінки; шапка пульта в один рядок (`HEADER_ONE_LINE`).
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12c"`.
  - Повний прогін триває понад пів години, і машині може забракнути пам'яті. Задача 9 запускає свій сценарій, а повний прогін — один раз у фоні наприкінці.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12c-`.
- Новий вміст (тексти e2e, приклади в довідці) — без тем росії й СРСР.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main`. Версія стану піднімається (15 → 16, 15 читається). Тож перед пушем треба перевірити `live_room` і, за правилом пам'яті «Deploys kill live games», спитати власника.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `quiz.test.ts`, `views.ts`, `events.ts`; `packages/engine/src/views.ts` (заглушка `self`/`opens`); фікстури `PublicClues` у тестах вебу й рушія | `cluePace`, `selfCluesMinTime`, `clues_self_time`, `isSelfPaced`, `ClueOpen`, `PublicClues.self/opens`, поступ `clues`, подія `player:clue` | 1 |
| `packages/engine/src/clues.ts`, `game.ts`, `restore.ts`, `game.clues-self.test.ts` (новий), `game.clues.test.ts`, `restore.test.ts` | `Play.clueOpens`, `openClue`, ціна за своїм числом, версія 16 | 2 |
| `packages/engine/src/views.ts`, `live.ts`, `views.clues-self.test.ts` (новий) | зрізи сцени, гравця й пульта; поступ `clues`; номер підказки з числа гравця | 3 |
| `apps/server/src/rooms/manager.ts`, `socket.ts`, `rooms/manager.clues-self.test.ts` (новий), `rooms/manager.restore.test.ts`, `rooms/manager.drafts.test.ts`, `socket.test.ts` | `clue()`, `player:clue` | 4 |
| `apps/web/src/help/questions.ts`, `help/host-help.test.ts` | довідка «Хто я?» | 5 |
| `apps/web/src/editor/QuestionEditor.tsx`, `editor/draft.ts`, `editor/draft-storage.ts`, `editor/QuizEditor.test.tsx`, `editor/draft.test.ts`, `i18n.ts`, `styles.css` | перемикач, перевірка, відновлення чернетки | 6 |
| `apps/web/src/screens/PlayerScreen.tsx`, `PlayerScreen.test.tsx`, `i18n.ts`, `styles.css` | «Ще підказка» на телефоні | 7 |
| `apps/web/src/screens/ClueOpens.tsx` (новий), `ClueOpens.test.tsx` (новий), `StageScreen.tsx`, `StageScreen.test.tsx`, `HostScreen.tsx`, `HostScreen.test.tsx`, `LiveAnswers.tsx`, `LiveAnswers.test.tsx`, `i18n.ts`, `styles.css` | «хто скільки відкрив» на сцені й пульті, «підказка 3/5» наживо | 8 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12c | 9 |

## Порядок збирання

- 1 → 2 → 3 → 4. Задачі 5 і 6 — після 1 (незалежні). Задача 7 — після 1 (тести на фікстурах зрізу; працює наживо після 3 і 4). Задача 8 — після 1. Задача 9 — останньою.
- **Навмисні зміни наявних очікувань** (лише такі):
  - фікстури `PublicClues` (задача 1): у `AnswerInput.test.tsx`, `CluesList.test.tsx`, `HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `SpotlightChoices.test.tsx`, `StageScreen.test.tsx` і в очікуваннях `packages/engine/src/views.clues-pin.test.ts` (там, де `toEqual` порівнює весь `clues`) додається `self: false, opens: null`;
  - `packages/engine/src/game.clues.test.ts` (задача 2): виклики `cluesAnswered(play, question, timeMs)` отримують четвертий аргумент — id гравця; очікувані числа не змінюються;
  - `packages/engine/src/restore.test.ts` (задача 2): `READABLE_STATE_VERSIONS` → `[2, …, 15, 16]`, новий `KEYS[16]` (як 15 плюс `Play.clueOpens`), `STATE_SHAPE.Play` з `clueOpens`, `representative()` з грою у власному темпі;
  - `apps/server/src/rooms/manager.drafts.test.ts` (задача 4): `expect(GAME_STATE_VERSION).toBe(15)` → `toBe(16)` (страховка 12b від випадкового підняття — тепер підняття навмисне);
  - `apps/web/src/screens/LiveAnswers.test.tsx` (задача 8): нічого не змінюється, лише додаються тести;
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Старі вікторини.** Запитання без `cluePace` поводиться як раніше: таймер відкриває підказки, ціна — за часом, усна клітинка — за ведучим. Наявні тести 10c без змін очікувань (задачі 2, 3, 9).
2. **Ціна.** Кожне місце, де рахується `paceFactor`/`verdictOf` для «Хто я?», бере `cluesPaid(play, playerId)`: класика, «Прийняти» на полі, оцінка ведучого на полі й у класиці (задача 2).
3. **Таємність.** Сцена до розкриття — лише перша підказка; телефон — лише свої (команда — свої; глядач поля — того, хто вибрав); `opens` телефону — `null` (задачі 3, 4, 9).
4. **Відмови.** Після відповіді, на паузі й утриманні, на заставці, після кінця часу, усі відкриті, не той гравець на полі, некапітан у команді, усна клітинка (задачі 2, 4).
5. **Стан і версія.** `GAME_STATE_VERSION` 16, 15 читається, `clueOpens` переживає перезапуск (задачі 2, 4).
6. **Вигляд.** Кнопка «Ще підказка · ціна стане N %» на 375 px; рядок «хто скільки відкрив» на сцені 1280 × 720 не прокручує сторінку; «підказка 3/5» у рядку пульта. Кадри `p12c-*`.

---

### Задача 1. Shared: поле `cluePace`, межа 20 с, `PublicClues.self/opens`, поступ `clues`, подія `player:clue`

**Files:**
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/views.ts`, `packages/shared/src/events.ts`, `packages/engine/src/views.ts` (лише заглушка в `publicClues`)
- Modify (фікстури): `apps/web/src/screens/AnswerInput.test.tsx`, `CluesList.test.tsx`, `HostScreen.test.tsx`, `PlayerScreen.test.tsx`, `SpotlightChoices.test.tsx`, `StageScreen.test.tsx`, `packages/engine/src/views.clues-pin.test.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- `packages/shared/src/quiz.ts`:
  - у `LIMITS` після `clueTailSeconds`:
    ```ts
    /** «Хто я?» у власному темпі (12c): найкоротший таймер запитання, с. */
    selfCluesMinTime: 20,
    ```
  - поруч із `QUESTION_TYPES`:
    ```ts
    /** Хто відкриває підказки «Хто я?» (12c): таймер (на усній клітинці — ведучий) або кожен гравець сам. */
    export const CLUE_PACES = ['timer', 'self'] as const;
    export type CluePace = (typeof CLUE_PACES)[number];
    ```
  - у `z.object({ ...base, type: z.literal('clues'), … })`:
    ```ts
    /** Секунд між підказками (класика й клітинка з телефона; на усній клітинці відкриває ведучий; у власному темпі не діє). Немає — типовий. */
    interval: z.number().int().min(LIMITS.minClueSeconds).max(LIMITS.maxClueSeconds).default(LIMITS.defaultClueSeconds),
    /** Хто відкриває підказки (12c): немає чи 'timer' — таймер; 'self' — кожен гравець сам (лише класика й звичайна клітинка з телефона). */
    cluePace: z.enum(CLUE_PACES).optional(),
    ```
  - у `superRefine`, гілка `q.type === 'clues'`:
    ```ts
    if (q.cluePace === 'self') {
      // Власний темп: інтервалу немає, але гравцеві треба час відкрити й прочитати кілька підказок.
      if (q.timeLimit < LIMITS.selfCluesMinTime) ctx.addIssue({ code: 'custom', message: 'clues_self_time' });
    } else if ((q.clues.length - 1) * q.interval + LIMITS.clueTailSeconds > q.timeLimit) ctx.addIssue({ code: 'custom', message: 'clues_time' });
    ```
  - нова функція поруч із `cluesAt`:
    ```ts
    /** «Хто я?», де кожен відкриває підказки сам (12c). */
    export function isSelfPaced(question: Question): boolean {
      return question.type === 'clues' && question.cluePace === 'self';
    }
    ```
- `packages/shared/src/views.ts`:
  ```ts
  /** «Хто я?» у власному темпі (12c): скільки підказок відкрив гравець (команда). */
  export interface ClueOpen {
    playerId: string;
    nickname: string;
    opened: number;
    /** Уже відповів (запис або відповідь поля, що чекає «Прийняти»). */
    answered: boolean;
  }
  ```
  `PublicClues` + (після `byHost`):
  ```ts
  /** Кожен відкриває сам (12c): nextAt — null, byHost — false; shown — свої (телефон) або лише перша (сцена, пульт). */
  self: boolean;
  /** Власний темп: хто скільки відкрив — сцені й пульту; телефону й поза власним темпом — null. */
  opens: ClueOpen[] | null;
  ```
  `LiveProgress` + `| { kind: 'clues'; opened: number; total: number }` (коментар: «Хто я?» у власному темпі (12c): скільки підказок відкрито).
- `packages/shared/src/events.ts`, у `ClientToServerEvents` після `'player:hint'`:
  ```ts
  /** «Хто я?» у власному темпі (12c): відкрити наступну підказку собі (у командній грі — команді). */
  'player:clue': (ack: Ack) => void;
  ```
- `packages/engine/src/views.ts`, `publicClues`: тимчасово `self: false, opens: null` (задача 3 дасть справжні значення).

- [ ] **Step 1: Write the failing tests** (`quiz.test.ts`, новий `describe` усередині `describe('clues (10c)', …)`, щоб узяти `cluesQ` та `issues`):
  ```ts
  describe('at own pace (12c)', () => {
    it('self needs no interval and no clue timing, but at least 20 s', () => {
      const { interval: _interval, ...noInterval } = cluesQ;
      const parsed = questionSchema.safeParse({ ...noInterval, cluePace: 'self', timeLimit: LIMITS.selfCluesMinTime });
      expect(parsed.success).toBe(true);
      expect(parsed.data).toMatchObject({ cluePace: 'self', interval: LIMITS.defaultClueSeconds });
      const six = { ...cluesQ, clues: [...cluesQ.clues, 'Шоста.'], interval: 30, cluePace: 'self' };
      expect(issues({ ...six, timeLimit: 20 })).toEqual([]); // (6 − 1) × 30 + 5 > 20, але clues_time не діє
      expect(issues({ ...six, timeLimit: 19 })).toContain('clues_self_time');
      expect(issues({ ...six, timeLimit: 19 })).not.toContain('clues_time');
    });

    it('timer is the default: a question without the field parses as before and keeps no key', () => {
      const parsed = questionSchema.safeParse(cluesQ);
      expect(parsed.success).toBe(true);
      expect('cluePace' in (parsed.data as object)).toBe(false);
      expect(issues({ ...cluesQ, cluePace: 'timer', timeLimit: 24 })).toContain('clues_time');
      expect(issues({ ...cluesQ, cluePace: 'magic' })).not.toEqual([]);
    });

    it('isSelfPaced and the same places as before', () => {
      expect(isSelfPaced({ ...cluesQ, cluePace: 'self' } as Question)).toBe(true);
      expect(isSelfPaced(cluesQ as unknown as Question)).toBe(false);
      expect(LIMITS.selfCluesMinTime).toBe(20);
    });
  });
  ```
  Окремо, поруч із наявною перевіркою `clues_place` (рядки ~1364–1366): та сама перевірка з `{ ...cluesQ, cluePace: 'self', timeLimit: 30 }` у бліці, фіналі й на бліц-клітинці → `clues_place`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/quiz.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Нове поле `PublicClues` обов'язкове, тож `pnpm typecheck` покаже фікстури. У кожну дописати `self: false, opens: null` — це навмисна правка з «Порядку збирання». Якщо `typecheck` вимагає гілки для нового виду поступу (вичерпний `switch` у вебі), додати `case 'clues': break;` з коментарем «12c, задача 8». Більше нічого не змінювати.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/web/src
  git commit -m "feat(shared): «Хто я?» at own pace — an optional cluePace 'self' that needs no interval and skips clue timing but takes at least 20 s, isSelfPaced, who opened how many clues in PublicClues, a clues progress for live rows and the player:clue event
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Рушій: `Play.clueOpens`, `openClue`, ціна за своїм числом, версія стану 16

**Files:**
- Create: `packages/engine/src/game.clues-self.test.ts`
- Modify: `packages/engine/src/clues.ts`, `packages/engine/src/game.ts`, `packages/engine/src/restore.ts`, `packages/engine/src/live.ts` (лише новий аргумент `cluesAnswered`), `packages/engine/src/views.ts` (так само)
- Test: `packages/engine/src/game.clues-self.test.ts`, `packages/engine/src/restore.test.ts`, `packages/engine/src/game.clues.test.ts` (навмисні правки — див. «Порядок збирання»)

**Interfaces:**
- `Play` (`game.ts`, після `clues`):
  ```ts
  /** «Хто я?» у власному темпі (12c): скільки підказок відкрив гравець (у командній грі — команда), від 1; немає ключа — 1. */
  clueOpens?: Record<string, number>;
  ```
  `createPlay` (гілка `...(question.type === 'clues' ? { clues: 1 } : {})`) не змінюється: `clueOpens` з'являється з першою відкритою підказкою.
- `clues.ts`:
  ```ts
  /** Кожен відкриває підказки сам (12c): cluePace 'self' у класиці чи на звичайній клітинці з телефона; на усній клітинці відкриває ведучий. */
  export function cluesBySelf(play: Play): boolean {
    return isSelfPaced(play.question) && play.blitz === undefined && play.final === undefined && !cluesByHost(play);
  }

  /** Скільки підказок відкрив гравець рушія (12c); немає запису — 1. */
  export function cluesOpenBy(play: Play, playerId: string): number {
    return play.clueOpens?.[playerId] ?? 1;
  }

  /** Скільки підказок бачить гравець: власний темп — свої (на полі — того, хто вибрав клітинку); інакше спільне cluesOpen(play). */
  export function cluesSeenBy(play: Play, viewerId: string): number {
    if (!cluesBySelf(play)) return cluesOpen(play);
    return cluesOpenBy(play, play.board?.chooserId ?? viewerId);
  }

  /** За скількома підказками платить відповідь: усна клітинка — cluesOpen(play); власний темп — cluesOpenBy; інакше undefined (за часом). */
  export function cluesPaid(play: Play, playerId: string): number | undefined {
    if (cluesByHost(play)) return cluesOpen(play);
    return cluesBySelf(play) ? cluesOpenBy(play, playerId) : undefined;
  }

  /**
   * Гравець (команда) відкриває собі наступну підказку (12c).
   * Помилки — за порядком у «Рішеннях плану»: wrong_phase, not_found, not_your_turn, already_answered, paused, not_started, time_over, clues_done.
   */
  export function openClue(state: GameState, playerId: string, now: number): Result;
  ```
  Кроки `openClue`:
  1. `open = openClues(state)`. `open === null || !cluesBySelf(open.play)` → `wrong_phase`.
  2. `!state.players.some((p) => p.id === playerId)` → `not_found`.
  3. `play.board !== undefined && play.board.chooserId !== playerId` → `not_your_turn`.
  4. `questionFor(state, play, playerId) !== play.question` → `wrong_phase` (запасне в класиці).
  5. `recordOf(state, state.questionIndex, playerId) !== undefined || (play.board?.answer ?? null) !== null || buffOf(play, playerId)?.first != null` → `already_answered`.
  6. `state.paused || state.heldAt !== null` → `paused`.
  7. `notStarted(state, now)` → `not_started`.
  8. `timeOverFor(state, play, playerId, now)` (`./timing`) → `time_over`.
  9. `opened = cluesOpenBy(play, playerId)`. `opened >= question.clues.length` → `clues_done`.
  10. `ok(withCurrentPlay(state, { ...play, clueOpens: { ...play.clueOpens, [playerId]: opened + 1 } }))`.

  Імпорти — під час виклику, як уже заведено в `clues.ts` (цикл `game.ts` ↔ `clues.ts` описано в шапці файлу).
- `nextClueAt`, `openDueClues`: після `cluesByHost(play)` — `|| cluesBySelf(play)` → `null` / той самий стан. Коментар `nextClueAt` доповнити: «…ведучий відкриває сам (усна клітинка), кожен відкриває сам (12c)…».
- `cluesAnswered(play, question, timeMs, playerId)`: `question.type !== 'clues'` → `null`; інакше `cluesPaid(play, playerId) ?? cluesAt(question, timeMs)`. Коментар: «усна клітинка — cluesOpen(play); власний темп — скільки відкрив гравець; інакше cluesAt». Виклики в `live.ts` (`responseClue`) і `views.ts` передають `playerId`.
- `game.ts`, підрахунок:
  - `submitAnswer`: `verdictOf(asked, answer, timeMs, cluesPaid(play, playerId))`;
  - `acceptAnswer`: `verdictOf(asked, pending.answer, timeMs, cluesPaid(play, pending.playerId))` і `ruled * paceFactor(asked, timeMs, cluesPaid(play, pending.playerId))`;
  - `overrideBoard`: `cluesByHost(play) ? cluesOpen(play) : undefined` → `cluesPaid(play, playerId)`. Коментар: «…«Хто я?» на усній клітинці — за підказкою, відкритою ведучим; у власному темпі — за своїм числом»;
  - `override` (класика, `const paid = accuracy * paceFactor(asked, record.timeMs)`): третій аргумент — `cluesPaid(play, playerId)`;
  - перевірити пошуком: інших викликів `verdictOf(`/`paceFactor(` для «Хто я?» немає (`survival.ts` «Хто я?» не має, `previewVerdict` бере лише оцінку, а вона від темпу не залежить).
- `restore.ts`: `GAME_STATE_VERSION = 16`. У коментар версій: `* 16 — 12c: Play.clueOpens (скільки підказок «Хто я?» відкрив кожен у власному темпі).` `READABLE_STATE_VERSIONS = [2, …, 14, 15, GAME_STATE_VERSION]` з поясненням: «15 → 16 лише додала необов'язкове Play.clueOpens (без нього в кожного 1 підказка), а стан версій 2–15 не може містити «Хто я?» у власному темпі (поля cluePace не було): тож кімната, збережена до розгортання 12c, теж відновлюється.»

- [ ] **Step 1: Write the failing tests** (`game.clues-self.test.ts`; помічники `openClassic`, `pickedCell`, `right`, `wrong`, `currentPlay` скопіювати з `game.clues.test.ts`, але з `selfClues`):
  ```ts
  import { DEFAULT_RULES, type Answer, type Question } from '@quiz/shared';
  import { describe, expect, it } from 'vitest';
  import { pickCell } from './board';
  import { cluesAnswered, cluesOpenBy, cluesSeenBy, nextClue, nextClueAt, openClue } from './clues';
  import { acceptAnswer, lock, next, override, pause, recordOf, resume, start, submitAnswer, tick, type GameState, type Play } from './game';
  import { boardRound, classicRound, clues, makeRoundsQuiz } from './testing/fixtures';
  import { lobbyWith, lobbyWithSplash, must, startRound } from './testing/helpers';

  const selfClues = { ...clues, cluePace: 'self' } satisfies Question; // 5 підказок, 30 с, 1000 балів
  const right: Answer = { type: 'clues', value: 'Тарас Шевченко' };
  const rng = () => 0;
  const currentPlay = (s: GameState): Play => s.plays[s.questionIndex];
  const opened = (s: GameState, id: string, times: number, at = 1000) => {
    for (let i = 0; i < times; i += 1) s = must(openClue(s, id, at));
    return s;
  };
  /** Класика без бонусу швидкості, запитання відкрите в 0; Анна p1, Богдан p2. */
  const openClassic = () => startRound(lobbyWith(makeRoundsQuiz([classicRound('r1', [selfClues], { rules: DEFAULT_RULES })]), 'Анна', 'Богдан'), 0, rng);

  describe('«Who am I?» at own pace (12c)', () => {
    it('each player opens their own clues; the timer opens nothing', () => {
      const s = opened(openClassic(), 'p1', 2);
      expect(currentPlay(s).clueOpens).toEqual({ p1: 3 });
      expect(cluesOpenBy(currentPlay(s), 'p2')).toBe(1);
      expect(cluesSeenBy(currentPlay(s), 'p1')).toBe(3);
      const later = tick(s, 25_000);
      expect(currentPlay(later).clues).toBe(1);
      expect(nextClueAt(later)).toBeNull();
    });

    it('the price follows the own count at the answer, not the time', () => {
      const s = opened(openClassic(), 'p1', 2);
      const a = must(submitAnswer(s, 'p1', right, 1500));
      const b = must(submitAnswer(a, 'p2', right, 25_000));
      expect(recordOf(b, 0, 'p1')).toMatchObject({ points: 600, accepted: true, grade: 'correct' });
      expect(recordOf(b, 0, 'p2')).toMatchObject({ points: 1000, accepted: true });
      expect(cluesAnswered(currentPlay(b), selfClues, 25_000, 'p2')).toBe(1);
      expect(cluesAnswered(currentPlay(b), selfClues, 1500, 'p1')).toBe(3);
    });
  });
  ```
  Решта тестів у тому самому `describe` (кожен — окремий `it`):
  - **після відповіді:** Анна відповіла → `openClue(s, 'p1', …)` → `already_answered`; її `clueOpens` не змінився.
  - **пауза й утримання:** `pause(s, 2000)` → `paused`; після `resume` → `ok`.
  - **заставка:** гра з `lobbyWithSplash` (запитання з заставкою, `startedAt` у майбутньому) → `openClue` до `startedAt` → `not_started`, після → `ok`.
  - **кінець часу:** `tick(s, 30_001)` → етап `locked` → `wrong_phase`; `lock(s)` → `wrong_phase`.
  - **усі відкриті:** чотири рази `openClue` → п'ятий `clues_done`.
  - **таймер як і раніше:** запитання `clues` без `cluePace` → `openClue` → `wrong_phase`; `tick(…, 5000)` відкриває другу спільну підказку (як у 10c).
  - **поле з телефона:** `pickedCell('phone')` з `selfClues`; Анна (вибрала) `openClue` двічі → `ok`, Богдан → `not_your_turn`; `cluesSeenBy(play, 'p2')` → 3 (глядач бачить підказки того, хто вибрав); Анна подає відповідь → `acceptAnswer` → запис з `accuracy` 0,6.
  - **усна клітинка ігнорує `self`:** `pickedCell('voice')` з `selfClues` → `openClue` → `wrong_phase`; `nextClue` ведучого → `ok`; `override(…, 'correct')` платить за `cluesOpen(play)` (2 → 0,8), як у 10c.
  - **оцінка ведучого на розкритті:** Анна відкрила 3 й відповіла «Франко» → закрити, розкрити → `override(s, 'p1', 'correct')` → бали 600 (за своїм числом, а не за часом).
  - **автопілот:** той самий стан з `autopilot: { authorId: 'p1', at: null }` → `openClue` → `ok`.
  - **команда:** `teamGame(makeRoundsQuiz([classicRound('r1', [selfClues])]), LAYOUT)` (`./testing/teams`, `LAYOUT` як у `game.teams-act.test.ts`) → `next` → `openClue(s, 't1', …)` → `clueOpens: { t1: 2 }`; `actorOf(s, 'm2', 'answer')` → `not_captain` (хто відкриває — вирішує сервер, задача 4).
  - `restore.test.ts`:
    - `it('a version 15 state (no clueOpens) restores; a self-paced play keeps clueOpens across the round trip', …)` — гра 10c (`clues` без поля) після `roundTrip(suspend(…))` має `'clueOpens' in play === false` і далі відкриває за таймером; гра з `selfClues`, де Оля відкрила 2, після `roundTrip(suspend(…))` має `clueOpens: { p1: 3 }`, а `submitAnswer` після `resume` платить 600;
    - навмисні правки з «Порядку збирання» (`READABLE_STATE_VERSIONS`, `KEYS[16]`, `STATE_SHAPE`, `representative()` + стан `must(openClue(openAt(lobbyWith(makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])]), 'Оля', 'Петро'), T0), 'p1', T0 + 1000))`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.clues-self.test.ts packages/engine/src/restore.test.ts packages/engine/src/game.clues.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Імпорт `isSelfPaced` з `@quiz/shared`. Наявні тести 10c не змінюють очікуваних чисел — лише четвертий аргумент `cluesAnswered`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server` → PASS (сервер упаде лише на `manager.drafts.test.ts` `toBe(15)` — цю правку робить задача 4; якщо так, прогнати сервер без цього файлу й назвати це в звіті).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): «Хто я?» at own pace — each player or team opens the next clue for itself while the shared timer opens nothing, refused after the answer, on a pause, a hold or a splash, after the time and for a watcher of a board cell; the answer pays by the own count in the classic round, on a board cell and in host grades, and a voice cell keeps host clues; state version 16 with Play.clueOpens, 15 still readable
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. Рушій, зрізи: сцена — перша підказка й «хто скільки відкрив», гравець — свої, пульт — поступ `clues`

**Files:**
- Create: `packages/engine/src/views.clues-self.test.ts`
- Modify: `packages/engine/src/views.ts`, `packages/engine/src/live.ts`
- Test: `packages/engine/src/views.clues-self.test.ts`

**Interfaces:**
- `views.ts`:
  - `publicClues(state)`:
    ```ts
    const self = cluesBySelf(play);
    return {
      total: question.clues.length,
      // Власний темп: спільне cluesOpen(play) завжди 1 — сцена й пульт бачать лише першу; свої телефон отримує в ownClues.
      shown: question.clues.slice(0, cluesOpen(play)),
      nextAt: nextClueAt(state),
      byHost: cluesByHost(play),
      intervalSeconds: question.interval,
      self,
      opens: self ? clueOpensOf(state, play) : null,
    };
    ```
  - нова функція:
    ```ts
    /** Хто скільки відкрив у власному темпі (12c): на полі — лише той, хто вибрав; у класиці — гравці на основному запитанні (без запасного), у порядку state.players. */
    function clueOpensOf(state: GameState, play: Play): ClueOpen[];
    ```
    `answered`: `recordOf(state, state.questionIndex, id) !== undefined || (play.board?.chooserId === id && play.board.answer !== null)`.
  - нова функція й виклик у `buildOwnView`:
    ```ts
    /** Власний зріз (12c): у власному темпі — свої відкриті підказки (глядач поля — того, хто вибрав), без списку opens. Інакше без змін. */
    function ownClues(state: GameState, playerId: string, question: PublicQuestion): PublicQuestion;
    ```
    `question.clues?.self !== true` → той самий об'єкт. Інакше `play.question` (тип `clues`) дає `shown: play.question.clues.slice(0, cluesSeenBy(play, playerId))`, `opens: null`.
    У `buildOwnView`: `question: shared.question === null ? null : withoutClip(ownClues(state, playerId, shared.question))`. Гілка `spare` не змінюється: на запасному підказок немає.
  - `hostView.responses[].clue` — `responseClue(state, player.id, record.timeMs)` уже з новим `cluesAnswered` (задача 2).
- `live.ts`:
  - `progressOf`, перед гілкою `chain`:
    ```ts
    // «Хто я?» у власному темпі (12c): скільки відкрито — біля кожного рядка (з відповіддю теж, номер підказки — у clue).
    if (question.type === 'clues' && cluesBySelf(play) && questionFor(state, play, id) === question) {
      return { kind: 'clues', opened: cluesOpenBy(play, id), total: question.clues.length };
    }
    ```
  - `responseClue(state, playerId, timeMs)` передає `playerId` у `cluesAnswered` (зроблено в задачі 2).

- [ ] **Step 1: Write the failing tests** (`views.clues-self.test.ts`; стан — як у задачі 2: `openClassic()` з `selfClues`, Анна відкрила 2, Богдан нічого; третій гравець Віра для рядка без відповіді — `lobbyWith(…, 'Анна', 'Богдан', 'Віра')`):
  ```ts
  describe('views of «Who am I?» at own pace (12c)', () => {
    it('the stage gets the first clue and who opened how many, never the other clues before the reveal', () => {
      const s = opened(openClassic(), 'p1', 2);
      const clues = stageView(s).question?.clues;
      expect(clues).toMatchObject({ total: 5, shown: [selfClues.clues[0]], self: true, nextAt: null, byHost: false });
      expect(clues?.opens).toEqual([
        { playerId: 'p1', nickname: 'Анна', opened: 3, answered: false },
        { playerId: 'p2', nickname: 'Богдан', opened: 1, answered: false },
        { playerId: 'p3', nickname: 'Віра', opened: 1, answered: false },
      ]);
      const json = JSON.stringify(stageView(s));
      for (const hidden of selfClues.clues.slice(1)) expect(json).not.toContain(hidden);
    });

    it('a phone gets only its own clues and no list', () => {
      const s = opened(openClassic(), 'p1', 2);
      expect(playerView(s, 'p1')?.question?.clues).toMatchObject({ shown: selfClues.clues.slice(0, 3), self: true, opens: null });
      expect(playerView(s, 'p2')?.question?.clues?.shown).toEqual([selfClues.clues[0]]);
      expect(JSON.stringify(playerView(s, 'p2'))).not.toContain(selfClues.clues[1]);
    });
  });
  ```
  Решта тестів у тому самому `describe`:
  - **розкриття:** Анна (3) і Богдан (1) відповіли, Віра — ні → `lock` → розкриття → `stageView(s).reveal.clues` — усі 5; `opens` → `answered` `true, true, false`, `opened` `3, 1, 1`.
  - **пульт:** `hostView(s).live.rows` → рядок Анни `progress: { kind: 'clues', opened: 3, total: 5 }`, `answered: false`; після її відповіді `clue: 3`; на розкритті `hostView(s).responses` Анни → `clue: 3`, Богдана → `clue: 1`.
  - **глядач поля:** `pickedCell('phone')` з `selfClues`, Анна відкрила 1 раз → `playerView(s, 'p2').question.clues.shown` — дві перші; `stageView(s).question.clues.opens` — лише Анна.
  - **команда:** гра з командами (`teamGame`), капітан відкрив за `t1` → `playerView(s, 'm2')` (товариш) — дві підказки, `playerView(s, 'm3')` (інша команда) — одна; `stageView(s).question.clues.opens` — команди з назвами.
  - **таймер як і раніше:** гра з `clues` без поля → `self: false`, `opens: null`, `progress: null` у рядку пульта, `shown` росте з `tick` (як у `views.clues-pin.test.ts`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/views.clues-self.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Імпорти `cluesBySelf`, `cluesOpenBy`, `cluesSeenBy` у `views.ts` і `live.ts`; `questionFor` у `live.ts` уже імпортовано.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src
  git commit -m "feat(engine): own-pace clue views — the stage and the host get only the first clue and who opened how many, each phone its own clues (a team the team's, a board watcher the chooser's), live rows carry «clue N of M» and the answer clue comes from the own count
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Сервер: `manager.clue` і подія `player:clue`

**Files:**
- Create: `apps/server/src/rooms/manager.clues-self.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`
- Test: `apps/server/src/rooms/manager.clues-self.test.ts`, `apps/server/src/rooms/manager.restore.test.ts`, `apps/server/src/rooms/manager.drafts.test.ts` (навмисна правка), `apps/server/src/socket.test.ts`

**Interfaces:**
- `manager.ts` (після `hint`):
  ```ts
  /** «Хто я?» у власному темпі (12c): людина відкриває наступну підказку собі; у командній грі — той, хто відповідає за команду (actorOf 'answer'). */
  clue(room: Room, playerId: string): AckResult {
    if (!this.alive(room)) return this.gone();
    // Поза запитанням — wrong_phase для всіх, а не not_captain для некапітана (як actAnswer).
    if (room.state.phase !== 'question') return { ok: false, error: 'wrong_phase' };
    const who = this.act(room, playerId, 'answer');
    if (!who.ok) return who;
    return this.apply(room, openClue(room.state, who.id, this.now()));
  }
  ```
  Імпорт `openClue` з `@quiz/engine`. Автопілот окремо не перевіряється: гравець відкриває сам і там.
- `socket.ts` (після `player:hint`):
  ```ts
  on('player:clue', () => {
    if (identity.role !== 'player' || identity.playerId === null) return FORBIDDEN;
    return manager.clue(room, identity.playerId);
  });
  ```

- [ ] **Step 1: Write the failing tests** (`manager.clues-self.test.ts`; `setup`, `enter`, `playing`, `teamPlaying`, `HOST`, `STAGE` скопіювати з `manager.drafts.test.ts`; вікторина — `makeRoundsQuiz([classicRound('r1', [{ ...clues, cluePace: 'self' }])])`, `clues` з `@quiz/engine/testing`; після `next` просунути `scheduler.advance(SPLASH_MS.question)`, щоб минула заставка):
  ```ts
  describe('own-pace clues in a room (12c)', () => {
    it('a player opens a clue; their view grows, the other phone and the stage keep the first', () => {
      const { scheduler, manager, room, olena, taras } = selfPlaying();
      expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
      expect(manager.clue(room, olena.playerId)).toEqual({ ok: true });
      expect(manager.view(room, olena.identity)?.question?.clues?.shown).toHaveLength(3);
      expect(manager.view(room, taras.identity)?.question?.clues?.shown).toHaveLength(1);
      const stage = JSON.stringify(manager.view(room, STAGE));
      for (const hidden of clues.clues.slice(1)) expect(stage).not.toContain(hidden);
      expect(manager.view(room, STAGE)?.question?.clues?.opens?.map((o) => o.opened)).toEqual([3, 1]);
    });
  });
  ```
  Решта тестів у тому самому `describe`:
  - **заставка:** одразу після `next` (без `advance`) → `{ ok: false, error: 'not_started' }`.
  - **пауза:** `host pause` → `paused`; `resume` → `ok`.
  - **після відповіді:** `manager.answer(room, olena.playerId, { type: 'clues', value: 'Шевченко' })` → `clue` → `already_answered`.
  - **лобі й розкриття:** до `start` → `wrong_phase`; після `lock` → `wrong_phase`.
  - **ціна:** Олена відкрила 2 й відповіла правильно, Тарас відповів на першій → після закриття бали Олени 600, Тараса 1000 (`room.state.players`).
  - **команда:** `teamPlaying([classicRound('r1', [selfClues])])` + `advance` → Тарас (не капітан) → `not_captain`; Олена (капітан) → `ok`; `manager.view(room, taras.identity).question.clues.shown` → 2 (товариш бачить); Іра (інша команда) → 1.
  - **автопілот:** `autopilot(quiz)` за зразком `manager.autopilot.test.ts` → гравець відкриває підказку → `ok`.
  - **стан і версія:** `GAME_STATE_VERSION` → `16`.
  - `manager.restore.test.ts`: кімната у власному темпі, Олена відкрила 2 → `snapshot` → `restore` → `view(Олена).question.clues.shown` має 3 (перепідключення бачить свої), `stateVersion` 16; збережена кімната з `stateVersion: 15` проходить `isSavedRoom` (поряд із наявною перевіркою `GAME_STATE_VERSION + 1` → `false`).
  - `manager.drafts.test.ts`: навмисна правка `toBe(15)` → `toBe(16)`.
  - `socket.test.ts`, новий `describe('own-pace clues (12c)', …)`:
    - `olena` шле `player:clue` → `{ ok: true }`, її наступний зріз має дві підказки, у зрізах сцени й `taras` немає тексту другої;
    - `player:clue` від `host` і `stage` → `forbidden`;
    - перепідключення: новий сокет Олени з тим самим токеном отримує зріз із двома підказками.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/rooms/manager.clues-self.test.ts apps/server/src/rooms/manager.restore.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): player:clue opens the next own-pace clue for a player or, in a team game, for whoever answers for the team; teammates see it, the stage and other phones keep the first clue, it works with no host and survives a restart in state version 16
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Довідка ведучого: «Хто я?» у власному темпі

**Files:**
- Modify: `apps/web/src/help/questions.ts`
- Test: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- `QUESTION_HELP.clues` (запис `clues` у `questions.ts`):
  - `what` — дописати: «…хто раніше впізнає відповідь, отримає більше. Або кожен гравець відкриває підказки сам — тоді менше відкрив, більше отримав.»
  - `how` — після рядка про інтервал:
    - «Перемикач «Підказки відкриваються: за таймером / кожен сам». «Кожен сам»: кожен гравець бачить спершу першу підказку й сам тисне «Ще підказка» на телефоні; закрити підказку не можна. Таймер спільний.»
    - «У режимі «кожен сам» сцена показує лише першу підказку й рядок, хто скільки відкрив («Оля 1 · Петро 3»), а на розкритті — усі підказки й на якій підказці відповів кожен. На пульті в «Відповідях наживо» біля кожного — «підказка 3/5».»
    - «У командній грі підказки відкриває той, хто відповідає за команду; товариші бачать ті самі.»
  - `points` — новий рядок: «У режимі «кожен сам» ціна — за тим, скільки підказок відкрив саме цей гравець у мить відповіді: з 5 підказок одна — 100 %, три — 60 %. Хто не відповів — 0.»
  - `limits` — нові рядки:
    - `` `«Кожен сам»: інтервалу немає, правило про останню підказку не діє, але час запитання — щонайменше ${LIMITS.selfCluesMinTime} с.` `` (шаблонний рядок, як наявні межі з `LIMITS`)
    - «На усній клітинці «кожен сам» не діє: підказки відкриваєте ви кнопкою на пульті.»
    - «Ще підказку не можна відкрити після відповіді, на паузі, на заставці й після кінця часу. Додатковий час нових підказок не відкриває — гравець відкриває сам.»
  - `tip` — третій рядок: «У режимі «кожен сам» дайте 40–60 с: гравцям треба час вирішити, чи ризикувати.»

- [ ] **Step 1: Write the failing tests** (`host-help.test.ts`):
  ```ts
  it('12c clues entry tells own pace, the button, the own price, 20 s and the voice cell', () => {
    filled('question.clues');
    const body = text('question.clues');
    for (const part of ['кожен сам', 'Ще підказка', 'Оля 1 · Петро 3', 'підказка 3/5', 'три — 60 %', `${LIMITS.selfCluesMinTime} с`, 'усній клітинці', 'відповідає за команду']) expect(body).toContain(part);
    expect(searchHelp('кожен сам')).toContain('question.clues');
  });
  ```
  Наявні перевірки `question.clues` (рядки ~181–183) лишаються зеленими.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help on «Хто я?» at own pace — each player opens clues with «Ще підказка», the stage shows who opened how many, the price follows the own count, at least 20 s, and a voice cell keeps host clues
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Веб, редактор: «Підказки відкриваються: за таймером / кожен сам»

**Files:**
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/draft.ts`, `apps/web/src/editor/draft-storage.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css` (за потреби)
- Test: `apps/web/src/editor/QuizEditor.test.tsx`, `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- `i18n.ts` (поруч із `cluesInterval`):
  `cluePaceLabel: 'Підказки відкриваються'`, `cluePaceTimer: 'за таймером'`, `cluePaceSelf: 'кожен сам'`, `cluesSelfHint: 'Кожен гравець сам відкриває наступну підказку кнопкою на телефоні — кожна знижує його ціну. Таймер спільний: щонайменше {min} с.'`, `cluesSelfVoiceNote: 'На усній клітинці «кожен сам» не діє: підказки відкриваєте ви кнопкою на пульті.'`, `problemCluesSelfTime: 'Запитання {index}: коли кожен відкриває підказки сам, дайте щонайменше {need} с.'`.
- `QuestionEditor.tsx`, `Body`, гілка `case 'clues'` — після написань (`spellingHint`), перед блоком інтервалу:
  ```tsx
  <div role="radiogroup" aria-label={t('cluePaceLabel')} className="clue-pace">
    <span className="meta">{t('cluePaceLabel')}</span>
    <label className="check">
      <input type="radio" name={`clue-pace-${question.id}`} checked={!self} onChange={() => setPace('timer')} />
      <span>{t('cluePaceTimer')}</span>
    </label>
    <label className="check">
      <input type="radio" name={`clue-pace-${question.id}`} checked={self} onChange={() => setPace('self')} />
      <span>{t('cluePaceSelf')}</span>
    </label>
  </div>
  ```
  - `const self = question.cluePace === 'self';`
  - `setPace('self')` → `onChange({ ...question, cluePace: 'self', interval: validInterval ? interval : LIMITS.defaultClueSeconds, timeLimit: Number.isFinite(question.timeLimit) ? Math.min(LIMITS.maxTime, Math.max(question.timeLimit, LIMITS.selfCluesMinTime)) : question.timeLimit })`, де `validInterval` — ціле в межах `minClueSeconds…maxClueSeconds`.
  - `setPace('timer')` → `const { cluePace: _pace, ...rest } = question; onChange({ ...rest, timeLimit: raisedTime(rest.timeLimit, rest.clues.length, cluesByHost ? LIMITS.minClueSeconds : rest.interval) })` — ключа немає, як у старих запитань.
  - Під перемикачем:
    - `cluesByHost` → `cluesVoiceHint` (як зараз), а якщо ще й `self` — `cluesSelfVoiceNote`;
    - `!cluesByHost && self` → `p.meta` з `cluesSelfHint` (`{ min: LIMITS.selfCluesMinTime }`); `NumberField` інтервалу й `cluesTimeHint` не рендеряться;
    - `!cluesByHost && !self` → як зараз.
  - `setClues` у власному темпі не піднімає час за інтервалом: `self ? question.timeLimit : raisedTime(…)`.
- `draft.ts`:
  - `questionProblem`, `case 'clues'`: після `problemNoAccepted` — `if (question.cluePace === 'self') { if (timeLimit < LIMITS.selfCluesMinTime) return 'problemCluesSelfTime'; break; }`; далі — наявні перевірки інтервалу й часу.
  - `problemText`: для `clues` з `cluePace === 'self'` — `need: LIMITS.selfCluesMinTime` (інакше як зараз).
  - `fitCell` не змінюється: на усній клітинці схований інтервал і далі найменший, а `cluePace` лишається (ведучий однаково відкриває сам, `cluesBySelf` його ігнорує).
- `draft-storage.ts`, гілка `base.type === 'clues'`: `cluePace` зберігається лише як `'self'`; будь-яке інше значення прибирається (`const { cluePace, ...rest } = base; return { ...rest, …, ...(cluePace === 'self' ? { cluePace: 'self' as const } : {}) }`).

- [ ] **Step 1: Write the failing tests**
  - `QuizEditor.test.tsx` (за зразком тесту «the clues chip shows three clues, the interval and the time hint…»):
    - нове запитання «Хто я?» → радіо «за таймером» позначене, «кожен сам» — ні; поле «Нова підказка кожні, с» є;
    - дотик до «кожен сам» → поля інтервалу немає, `cluesTimeHint` немає, є текст «Кожен гравець сам відкриває наступну підказку…»; збережена вікторина (`onSave`/`fetch` моку, як у сусідніх тестах) має `cluePace: 'self'` і `timeLimit ≥ 20`;
    - назад «за таймером» → поле інтервалу знову є, у збереженому запитанні немає ключа `cluePace`;
    - клітинка поля з усною відповіддю → `cluesVoiceHint`, а з «кожен сам» ще й `cluesSelfVoiceNote`.
  - `draft.test.ts`:
    - `self`, `timeLimit: 19` → `problemCluesSelfTime` з текстом «…щонайменше 20 с.»; `timeLimit: 20`, 6 підказок, інтервал 30 → проблем немає;
    - `self` з `interval: NaN` → проблеми інтервалу немає (схований);
    - відновлення чернетки (`draft-storage`) з `cluePace: 'self'` → лишається; з `cluePace: 'magic'` → ключа немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor` → FAIL.
- [ ] **Step 3: Implement.** Стиль `.clue-pace` — у рядок, як `.survival-settings [role=radiogroup]`; на 375 px — переноситься без горизонтальної прокрутки.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the editor switch «Підказки відкриваються: за таймером / кожен сам» — own pace hides the interval and the clue timing, raises the time to 20 s and checks it, a voice cell says the host still opens clues, and the timer keeps no cluePace key
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Веб, телефон: кнопка «Ще підказка · ціна стане N %»

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`

**Interfaces:**
- `i18n.ts`: `clueMore: 'Ще підказка · ціна стане {percent} %'`, `typeHowCluesSelf: 'Підказки відкриваєш сам кнопкою «Ще підказка» — кожна знижує ціну. Відповідай, щойно впізнаєш; спроба одна.'`.
- `CluesNow` (`PlayerScreen.tsx`):
  ```tsx
  /** «Хто я?» на телефоні: відкриті підказки, частка ціни зараз і (власний темп, 12c) кнопка наступної з ціною після натиску. */
  function CluesNow({ clues, offsetMs, more }: { clues: PublicClues; offsetMs: number; more?: { disabled: boolean; onOpen: () => void } }) {
    const k = Math.max(1, clues.shown.length);
    return (
      <>
        <CluesList clues={clues} offsetMs={offsetMs} />
        <p className="meta clues-now">{t('cluesNow', { k, n: clues.total, percent: Math.round(clueShare(clues.total, k) * 100) })}</p>
        {more !== undefined && k < clues.total && (
          <button type="button" className="btn clue-more" disabled={more.disabled} onClick={more.onOpen}>
            {t('clueMore', { percent: Math.round(clueShare(clues.total, k + 1) * 100) })}
          </button>
        )}
      </>
    );
  }
  ```
- `PlayerScreen`:
  ```ts
  // «Хто я?» у власному темпі (12c): відкриває той, хто відповідає (у команді — хто діє за неї; на полі — хто вибрав), до відповіді.
  const [clueBusy, setClueBusy] = useState(false);
  const cluesMine = phase === 'question' && question?.clues?.self === true && acting && me.answer === null && (board === null || chooserIsMe) && !onSpare;
  const openClue = async () => {
    setClueBusy(true);
    const result = await send('player:clue');
    setClueBusy(false);
    setError(result.ok ? null : errorText(result.error));
  };
  ```
  `{question.clues !== null && <CluesNow clues={question.clues} offsetMs={offsetMs} more={cluesMine ? { disabled: locked || buffTimeOver || clueBusy, onOpen: () => void openClue() } : undefined} />}`.
  Перевірити, що `board` і `chooserIsMe` оголошено вище місця використання (за потреби перенести `cluesMine` нижче за `chooserIsMe`).
- Підказка типу: `const tip = … ? (me.tip === 'clues' && question?.clues?.self === true ? t('typeHowCluesSelf') : typeHow(me.tip, …)) : null`.
- `styles.css`: `.clue-more { width: 100%; margin-top: 0.5rem; }`; текст не переноситься гірше ніж у два рядки на 375 px.

- [ ] **Step 1: Write the failing tests** (`PlayerScreen.test.tsx`; зріз «Хто я?» з наявних фікстур + `self: true`, `opens: null`, `shown` — дві з п'яти):
  - соло на `question`: кнопка «Ще підказка · ціна стане 60 %»; рядок «Підказка 2 з 5: правильна відповідь зараз — 80 % ціни»; дотик → `send('player:clue')`;
  - `send` відповідає `{ ok: false, error: 'clues_done' }` → текст «Усі підказки вже відкрито.»;
  - `shown` — усі 5 → кнопки немає;
  - `me.answer` не `null` → кнопки немає, підказки видно;
  - `paused: true` → кнопка `disabled`; заставка запитання (`splash` як у наявних тестах `notStarted`) → `disabled`;
  - команда: `team.canAct: false` (товариш) → кнопки немає, підказки видно; `team.canAct: true` → є;
  - поле: `view.board.turn.playerId` — інший гравець → кнопки немає;
  - `self: false` (таймер) → кнопки немає (як 10c);
  - `me.tip: 'clues'` з `self: true` → «Підказки відкриваєш сам кнопкою «Ще підказка»…»; з `self: false` → наявний текст `typeHow_clues`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «Ще підказка · ціна стане N %» on the phone for own-pace «Хто я?» — for whoever answers, gone after the answer and when all clues are open, disabled on a pause, a splash and after the time, never for teammates or board watchers, with an own-pace type tip
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Веб, сцена й пульт: «хто скільки відкрив», «підказка 3/5» наживо

**Files:**
- Create: `apps/web/src/screens/ClueOpens.tsx`, `apps/web/src/screens/ClueOpens.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `apps/web/src/screens/HostScreen.tsx` (`HostClues`), `apps/web/src/screens/LiveAnswers.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/ClueOpens.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `LiveAnswers.test.tsx`

**Interfaces:**
- `i18n.ts`: `cluesOnPhoneSelf: 'Кожен відкриває підказки на телефоні сам: що менше підказок, то більше балів.'`, `clueOpensLabel: 'Скільки підказок відкрив кожен'`, `clueOpenItem: '{name} {n}'`, `clueOpenAnswered: '{name} — на підказці {n}'`, `clueOpenNone: '{name} — без відповіді'`, `cluesHostSelf: 'Кожен відкриває підказки сам: ціна — за тим, скільки відкрив.'`, `liveClues: 'підказка {opened}/{total}'`.
- `ClueOpens.tsx`:
  ```tsx
  import type { ClueOpen } from '@quiz/shared';
  /** «Хто я?» у власному темпі (12c): «Оля 1 · Петро 3 · Іра 2»; на розкритті — «Оля — на підказці 1 · Іра — без відповіді». */
  export function ClueOpens({ opens, revealed, big = false }: { opens: ClueOpen[]; revealed: boolean; big?: boolean }) {
    if (opens.length === 0) return null;
    const text = (o: ClueOpen) =>
      !revealed ? t('clueOpenItem', { name: o.nickname, n: o.opened }) : o.answered ? t('clueOpenAnswered', { name: o.nickname, n: o.opened }) : t('clueOpenNone', { name: o.nickname });
    return (
      <p className={big ? 'clue-opens is-big' : 'clue-opens'} aria-label={t('clueOpensLabel')}>
        {opens.map((o, i) => (
          <span key={o.playerId} className="clue-open">
            {i > 0 && ' · '}
            {text(o)}
          </span>
        ))}
      </p>
    );
  }
  ```
- `StageScreen.tsx`:
  - підказка під запитанням: `question.type === 'clues' ? t(question.clues?.self === true ? 'cluesOnPhoneSelf' : 'cluesOnPhone')`;
  - одразу після `CluesList`: `{question.clues?.opens != null && !finalReveal && <ClueOpens opens={question.clues.opens} revealed={view.phase === 'reveal'} big />}`.
- `HostScreen.tsx`, `HostClues`: `pub.self` →
  - список усіх підказок без `span.clue-state` (усі «відкриті» для ведучого, бо стан у кожного свій);
  - замість `cluesHostNow` — `p.meta` `cluesHostSelf`;
  - `{pub.opens !== null && <ClueOpens opens={pub.opens} revealed={view.phase === 'reveal'} />}`;
  - кнопки «Відкрити підказку» немає (вона й так лише для `byHost`).
- `LiveAnswers.tsx`:
  - `started(row)`: `case 'clues': return true;` (у власному темпі рядок видно завжди — «біля кожного»);
  - `liveAnswerText`, гілка поступу: `case 'clues': if (!row.answered) parts.push(t('liveClues', { opened: progress.opened, total: progress.total })); break;` (з відповіддю номер показує наявне `clueAt`). Заглушку `case 'clues'` із задачі 1, якщо вона є, замінити цим.
- `styles.css`: `.clue-opens` — `display: flex; flex-wrap: wrap; justify-content: center; gap: 0 0.25rem;`, `.clue-opens.is-big` — шрифт сцени середній (не більший за `.clues-list.is-big .clue-text`), не більше двох рядків для 8 гравців на 1280 × 720 (`overflow: hidden`, `max-height` на два рядки); `.host-clues .clue-opens` — зліва, `var(--dim)`.

- [ ] **Step 1: Write the failing tests**
  - `ClueOpens.test.tsx`: `[{ Оля 1 }, { Петро 3 }, { Іра 2 }]`, `revealed: false` → текст «Оля 1 · Петро 3 · Іра 2»; `revealed: true`, Іра без відповіді → «Оля — на підказці 1 · Петро — на підказці 3 · Іра — без відповіді»; порожній список → нічого.
  - `StageScreen.test.tsx`: зріз сцени «Хто я?» з `self: true`, `shown` — одна, `opens` — три → одна `.clue` без `is-hidden`, чотири `.clue.is-hidden` «Підказка N» (без «за N с»), `.clue-opens` «Оля 1 · Петро 3 · Іра 2», підказка «Кожен відкриває підказки на телефоні сам…»; на `reveal` з `reveal.clues` → п'ять підказок і «— на підказці».
  - `HostScreen.test.tsx`: `HostClues` з `self: true` → п'ять підказок без «за N с»/«відкрито», «Кожен відкриває підказки сам…», `.clue-opens`; без `self` — як зараз.
  - `LiveAnswers.test.tsx`: рядок без відповіді з `progress: { kind: 'clues', opened: 3, total: 5 }` → `.live-row` з «підказка 3/5» (не в «Чекаємо»); з відповіддю `clues` «Шевченко», `clue: 3` → «Шевченко» і «на підказці 3», без «підказка 3/5»; `collapsed` → рядків немає (як 12b).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/ClueOpens.test.tsx apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/LiveAnswers.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): own-pace «Хто я?» on the stage and the host — the first clue with «Оля 1 · Петро 3 · Іра 2», on the reveal every clue with the clue each answered on, the host list of all clues with the same line, and «підказка 3/5» beside every live row
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 9. Наскрізний сценарій 12c з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `click`, `field`, `afterSplash`, `shot`, `snapshot`, `socketFrames`, `liveRow`, `expectNoSideScroll`, `expectStageInView`, `HEADER_ONE_LINE`, `POLL`, `exact`, `NL`, `clueTexts` (10c), `scoreOf`, `bodyText`, `problems`.
- Вміст — без тем росії й СРСР. Вікторина «Хто я 12c», один класичний раунд «Хто я?» (`speedBonus: false`, `rules: DEFAULT_RULES`), `leaderboard: 'end'`:
  ```ts
  const SKOVORODA = {
    id: 's1', type: 'clues' as const, text: 'Хто я?', imageUrl: null, video: null, timeLimit: 60, points: 1000,
    clues: [
      'Я народився 1722 року на Полтавщині.',
      'Я багато років мандрував пішки.',
      'Я писав байки, пісні й філософські діалоги.',
      'На моєму надгробку: «Світ ловив мене, та не спіймав».',
      'Мій портрет — на 500 гривнях.',
    ],
    accepted: ['Сковорода', 'Григорій Сковорода'],
    interval: 8,
    cluePace: 'self' as const,
  };
  ```
- Гравці: Оля (відповідає на першій підказці), Петро (відкриває до третьої), Іра (відкриває другу й не відповідає).

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12b:
  ```ts
  it('part 12c: «Хто я?» at own pace — the editor switch on 375 px, each phone opens its own clues with «Ще підказка · ціна стане N %», the 1280 × 720 stage shows only the first clue and «Оля 1 · Петро 3 · Іра 2», the host sees «підказка 3/5» live, a pause disables the button, a reload keeps the own clues, different prices for the same right answer, and the reveal names the clue each answered on', async () => {
    try {
      await selfClues12c();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `selfClues12c()`:**
  1. `host = open('host12c', 375, 812)`, `register(host, 'host', 'Ліна Ведуча', 'host12c@example.com')`; `hostFrames = socketFrames(host)`.
  2. Вікторина вище → `POST /api/quizzes` → `quizId`.
  3. **Редактор на 375 px.** «/quizzes» → рядок «Хто я 12c» → «Редагувати» → `main.editor` → «Запитання 1»:
     - `host.getByRole('radio', { name: 'кожен сам', ...exact })` позначене; поля «Нова підказка кожні, с» немає (`count() === 0`); текст «Кожен гравець сам відкриває наступну підказку…» видно;
     - `expectNoSideScroll(host, 'p12c-editor-375')`; кадр `p12c-editor-375`;
     - «за таймером» → поле інтервалу з'являється; знову «кожен сам» → зникає;
     - «Зберегти» → `/quizzes`; `GET /api/quizzes/${quizId}` → у запитанні `cluePace: 'self'`.
  4. «Грати» → `code`, `stageUrl`; `stage = open('stage12c', 1280, 720)` з `stageFrames`; телефони 375 × 812 `olya` (`olyaFrames`), `petro` (`petroFrames`), `ira` (`iraFrames`); `join` «Оля», «Петро», «Іра».
  5. «Почати гру» → `afterSplash` → «Почати раунд» → `afterSplash`.
  6. Локатори: `more(page) = page.locator('.clue-more')`; `opensLine = stage.locator('.clue-opens')`; `row(name) = liveRow(host, name)`; `const [c1, c2, c3, c4, c5] = SKOVORODA.clues`.

  **Кроки:**
  1. **Перша підказка всюди.** `clueTexts(olya|petro|ira)` → `[c1]`; `clueTexts(stage)` → `[c1]`; `opensLine` → «Оля 1 · Петро 1 · Іра 1»; `more(olya)` → «Ще підказка · ціна стане 80 %»; на сцені «Кожен відкриває підказки на телефоні сам…».
  2. **Петро відкриває дві.** `more(petro).click()` → `clueTexts(petro)` має 2, кнопка «… 60 %» → ще раз → 3, кнопка «… 40 %»; `petro.getByText(/Підказка 3 з 5: правильна відповідь зараз — 60\s*%\s*ціни/)`; `clueTexts(olya)` і `clueTexts(stage)` — досі `[c1]`; `opensLine` → «Оля 1 · Петро 3 · Іра 1»; `row('Петро').locator('.live-answer')` містить «підказка 3/5», `row('Оля')` — «підказка 1/5»; `host.evaluate(HEADER_ONE_LINE)` → `true`.
     - `expectNoSideScroll(petro, 'p12c-phone-more')`; кадр `p12c-phone-more`; кадр пульта `p12c-host-live` (`expectNoSideScroll(host, 'p12c-host-live')`).
  3. **Пауза.** `click(host, 'Пауза')` → `more(ira)` `isDisabled()` → `true` (`expect.poll`); `host.getByRole('button', { name: 'Продовжити', ...exact }).last().click()` → `more(ira)` активна; Іра відкриває одну → `clueTexts(ira)` має 2; `opensLine` → «Оля 1 · Петро 3 · Іра 2».
  4. **Перепідключення.** `petro.reload()` → `petro.locator('.clues-list').waitFor()` → `clueTexts(petro)` → `[c1, c2, c3]` (свої з пам'яті сервера).
  5. **Сцена.** `expectStageInView(stage, 'p12c-stage-question')`; кадр `p12c-stage-question` (перша підказка, чотири «Підказка N», рядок «Оля 1 · Петро 3 · Іра 2»).
  6. **Таємність до розкриття** (знімки кадрів зараз, до відповідей):
     - `stageFrames.join(NL)` не містить `c2`, `c3`, `c4`, `c5` і «Сковорода»;
     - `olyaFrames` — не містить `c2`…`c5`; `iraFrames` — не містить `c3`…`c5`; `petroFrames` — не містить `c4`, `c5`;
     - `hostFrames.join(NL)` містить `c5` (пульт бачить усі підказки — перевірка, що кадри справді збираються).
  7. **Відповіді.** Оля «Сковорода» → «Відповісти» → `more(olya)` → 0. Петро «Григорій Сковорода» → «Відповісти». Іра не відповідає. `click(host, 'Закрити запитання')` → `host.getByText('Запитання закрите')`.
  8. **Розкриття.** «Показати відповідь» → `clueTexts(stage)` має 5; `opensLine` → «Оля — на підказці 1 · Петро — на підказці 3 · Іра — без відповіді»; `host.locator('li', { hasText: 'Петро' }).getByText('на підказці 3', exact)`; `scoreOf(host, 'Оля')` → 1000, `scoreOf(host, 'Петро')` → 600, `scoreOf(host, 'Іра')` → 0.
     - `expectStageInView(stage, 'p12c-stage-reveal')`; кадр `p12c-stage-reveal`; кадр `p12c-phone-reveal` (Петро: усі підказки й свій результат).
  9. «Далі» → п'єдестал (`stage.getByRole('heading', { name: 'Переможці' })`).
  10. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім у фоні `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12c"` → PASS. Переглянути кадри `p12c-*`:
  - редактор на 375 px: перемикач у рядок або перенесений, без горизонтальної прокрутки; поля інтервалу немає;
  - телефон: кнопка «Ще підказка · ціна стане 40 %» на всю ширину, не налазить на поле відповіді;
  - пульт 375 px: шапка в один рядок; рядок «Петро … підказка 3/5»;
  - сцена 1280 × 720: перша підказка великим, заглушки «Підказка N», рядок «хто скільки відкрив» видно повністю без прокрутки; на розкритті — п'ять підказок і «— на підказці».
- [ ] **Step 3: Повний прогін — один раз, у фоні:** `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо — 10c (таймер і усна клітинка без змін), 9b (перезапуск із новою версією стану), 12b (живі рядки). Якщо PGlite чи браузер падає з браком пам'яті, перезапустити лише сценарії, що впали (`-t "<назва>"`), і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12c end-to-end — the editor own-pace switch on 375 px, phones open their own clues with «Ще підказка · ціна стане N %», the 1280 × 720 stage keeps the first clue with «Оля 1 · Петро 3 · Іра 2» and no later clue in its frames, «підказка 3/5» on the host, a pause disables the button, a reload keeps the own clues, 1000 and 600 for the same right answer, and the reveal names the clue each answered on
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
