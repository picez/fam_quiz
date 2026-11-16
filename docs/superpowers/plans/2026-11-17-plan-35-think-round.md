# План 35: раунд «Думай інакше»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Звірка з кодом.** План спирається на назви з `main` на 2026-11-17 (`286e8810`): `ROUND_TYPES` (12 типів, останній `quest`), `QUESTION_TYPES` (28 типів, останній `bluff`), `QUESTION_TYPE_TRAITS` (`packages/shared/src/question-types.ts`), `AUTOPILOT_BLOCKS = []` (`packages/shared/src/autopilot.ts`), `GAME_STATE_VERSION = 22`, найновіший список ключів `ADDED_TRUTH_TEAM` у `apps/web/src/i18n.test.ts` (назва `ADDED_35` уже зайнята судоку — **не** використовувати). Зразки:
> - «Вибування» (`packages/engine/src/survival.ts`): стан, виведений із журналу, бонус наприкінці через `addAdjustment(…, 'survival')` в `finishRound`;
> - «Правда про гравця» (28b): `truth.ts`, гілки `truth` у `game.ts` (`openQuestion`, `submitAnswer`, `autoLock`, `override`, `next`), `optional('truth', …)` у `views.ts`, `TruthView.tsx`, `host:truth-hide` → `HostAction` у `apps/server/src/rooms/manager.ts`, `RateKind`;
> - «Мелодія» (29e) — свій тип відповіді `{ type: 'melody', value }` в `answer.ts`.
>
> **Перед кожною задачею виконавець звіряє назви й рядки з фактичним кодом.** Розбіжність — привід міняти лише назви й рядки, не рішення плану.

**Мета:** новий тип раунду `think` («Думай інакше»). Гравці мають N життів. На кожне питання кожен пише одне слово на тему. Ведучий має 1–3 слова з синонімами: заготовлені в редакторі або вписані під час питання. Хто збігся зі словом ведучого (м'яко: регістр, апострофи, пробіли, закінчення) або нічого не написав, втрачає життя. Ведучий може вручну зарахувати чи зняти збіг. 0 життів — гравець вибуває й лишається глядачем. Раунд закінчується, коли скінчились питання або живим лишився один (якщо починали ≥ 2). Місця перетворюються на очки: `round(P × (n − k) / (n − 1))`.

**Архітектура:**
- **Дані (`shared`).**
  - Новий тип запитання `think`, що живе **лише** в раунді `think`: `{ ...base, type: 'think', words: ThinkWord[] }`, де `ThinkWord = { word: string; synonyms: string[] }`, 0–3 слова.
  - Новий раунд `thinkRoundSchema` `{ id, type: 'think', title, description?, lives, points, questions }`; таймер — `timeLimit` кожного питання (у редакторі типово 30).
  - Нова відповідь `{ type: 'think', value: string }`.
  - М'яке порівняння: `thinkKey`/`thinkStem` (shared, без залежностей) і `thinkHit` (engine, з допуском до одруківки `textAccepts`).
- **Стан (`engine`).** Лише одне нове **необов'язкове** поле `Play.think?: ThinkPlay`. Життя, вибування й місця **виводяться з журналу** (як `survivalOut`), тож `GameState` не міняється.
  ```ts
  /** Лише в запитанні раунду think (35). */
  export interface ThinkPlay {
    /** Слова ведучого: копія question.words на відкритті; ведучий замінює список, поки йде таймер (і один раз після нього, якщо список порожній). */
    words: ThinkWord[];
    /** Життя кожного учасника раунду (соло — гравець, командна гра — команда) на мить відкриття; 0 — уже вибув. Немає ключа — не учасник (глядач). */
    lives: Record<string, number>;
    /** Розкриття відбулося (next з locked): лише такі запитання забирають життя. */
    revealed: boolean;
  }
  ```
  - Новий файл `packages/engine/src/think.ts` містить: `thinkRoundOf`, `thinkPlayOf`, `thinkHit`, `thinkVerdicts`, `thinkLivesAfter`, `thinkAlive`, `thinkOver`, `thinkPlaces`, `thinkPoints`, `openThink` (знімок життів), `setThinkWords`, `withThinkGrades`, `awardThinkPlaces`.
- **Записи.** Відповідь гравця — звичайний `AnswerRecord` з `points: 0`, `basePoints: 0`, `streakBonus: 0`. `grade` = `'correct'` (не збігся — «в безпеці») чи `'wrong'` (збігся). Його перераховує `withThinkGrades` у `withTotals` з поточних слів. Запис з `overridden: true` (ручна оцінка ведучого) не перераховується. Порожня чи відсутня відповідь живого учасника на розкритому запитанні — втрата життя без запису.
- **Очки** — коригування `source: 'think'` на кінці раунду (`awardThinkPlaces` у `finishRound`, як `awardSurvivalBonus`), ідемпотентно.
- **Зрізи.** `BaseView.think?: ThinkInfo` (сцена й усі), `HostView.think?: HostThink`, `PlayerView.me.think?: PlayerThink` — лише в раунді `think`. Слова ведучого й чужі відповіді до `reveal` — **тільки** в `HostThink`.
- **Сервер.**
  - Подія `host:think-words` → `HostAction { type: 'think-words'; words }`, частота `THINK_WORDS_PER_SECOND = 4`.
  - Відповідь гравця — наявна `player:answer`.
  - Ручна оцінка — наявна `host:override` (`'wrong'` = збіг, `'correct'` = не збіг).
  - `PlayRef.think = { words }` — фінальні слова для історії, бо знімок вікторини має лише заготовлені.
- **Веб.** Новий `apps/web/src/screens/ThinkView.tsx` (`ThinkInput`, `ThinkHearts`, `ThinkPhoneVerdict`, `HostThinkWords`, `HostThinkAnswers`, `ThinkStage`, `ThinkReveal`, `ThinkPlaces`). Новий `apps/web/src/editor/ThinkWordsEditor.tsx`. Поля раунду — у `RoundSettings.tsx`.

**Технології:** TypeScript, zod 4, vitest (проєкти `shared`/`engine`/`server`/`web` у `vitest.config.ts`), Fastify + Socket.IO, React 19 + Vite + Testing Library, Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-17-think-different-round-design.md` — уся. Зразки планів: `docs/superpowers/plans/2026-11-10-plan-28b-player-truth.md`, `2026-11-09-plan-27a-bets-round.md`, `2026-11-10-plan-27b-auction-round.md`. Назви, підхід і стиль тестів — звідти.

## Глобальні обмеження

- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, довідка — `*.help.json` тих самих 6 мов. Нові uk-ключі — у новому списку `ADDED_THINK` в `apps/web/src/i18n.test.ts`, доданому до умови `adds no uk keys beyond the agreed list` і до перевірки наявності в усіх локалях (як `ADDED_29H`). ru немає.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Нічого, пов'язаного з росією**, у прикладах, тестах, e2e і сіді.
- Тести: завжди `--maxWorkers=2`.
  - Юніт-тести проєкту: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`.
  - Типи: `pnpm typecheck`.
  - **Ніколи не запускати prettier.**
- e2e:
  - `pnpm build`, потім на передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 35"`, менше 10 хв;
  - кадри — з `E2E_SHOTS=1`.
- Таймер кожного питання в сіді й e2e-вікторинах ≥ 25 с.
- **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).**
  - Нове в стані — лише необов'язкове `Play.think`.
  - Нові значення є лише в типах, яких старий знімок не містить: `RoundType 'think'`, `QuestionType 'think'`, `Answer 'think'`, `AdjustmentSource 'think'`, `ScoreSource 'think'`, `BuffWhy 'off_think'`, нові `ErrorCode`.
  - У коментар до `READABLE_STATE_VERSIONS` (`packages/engine/src/restore.ts`) додати рядок: «35 без нової версії: раунд і тип think, необов'язкове Play.think, AdjustmentSource 'think'; старий знімок не містить нічого з цього».
  - Тож пуш **не** обриває живі ігри.
  - Якщо виконавцю все ж знадобиться обов'язкове поле чи зміна наявного — **зупинитися й спитати контролера**: підвищення до 23 обриває живі ігри, і власника треба питати перед пушем.
- Нові поля схем — лише в новому раунді й типі. Кожна наявна вікторина й знімок проходять без змін.

## Рішення плану (там, де специфікація мовчить)

- **Межі** (`LIMITS`):
  - `minThinkLives: 1`, `maxThinkLives: 10`, `defaultThinkLives: 3`;
  - `maxThinkPoints: 10_000` (приклад власника — 10 000; = `maxAdjust`), `defaultThinkPoints: 5000`;
  - `minThinkQuestions: 3`, `maxThinkQuestions: 30`;
  - `maxThinkWords: 3`, `maxThinkSynonyms: 5`, `thinkWord: 40` (і слово ведучого, і синонім, і відповідь гравця).
- **Схема:**
  - раунд `think` приймає лише запитання `think` (`think_type`);
  - запитання `think` поза раундом `think` → `think_round`;
  - у межах одного запитання ключі `thinkKey` слів і синонімів не повторюються → `think_words_dup`;
  - `points` запитання (поле `base`) не важить, редактор ставить 0;
  - `speedBonus`, `shuffleOptions`, `rules` раунд не має: `rulesOf(think) = DEFAULT_RULES`, `speedOn` → `false`, `shuffles(think)` → `false`;
  - кількість раундів `think` у вікторині не обмежена (лише загальні 10).
- **М'яке порівняння.**
  - `thinkKey(value)`: `answerKey` (NFC, регістр, лапки, пробіли), далі **прибрати всі апострофи** (`'`, `’`, `ʼ`, `` ` ``), щоб «пʼять» = «п'ять» = «пять».
  - `thinkStem(value)`: для кожного слова `thinkKey` (за пробілами) відкидає **одне** найдовше закінчення зі списку, якщо лишається ≥ 3 літери; слова з'єднуються пробілом.
  - Список закінчень (від довших до коротших):
    ```
    'ього','ьому','ого','ому','ими','іми','ями','ами','ією','ові','еві','єві',
    'ий','ій','ої','ою','ею','єю','им','ім','их','іх','ів','їв','ам','ям','ах','ях','ом','ем','єм','ія','ії','ію',
    'а','я','о','е','є','і','ї','и','у','ю','ь','й'
    ```
  - Приклади: «фіолетовий»/«фіолетова»/«Фіолетові» → `фіолетов`; «яблуко»/«яблука»/«яблуком» → `яблук`; «кіт» → `кіт`. Чергування «кіт/кота» не ловиться — для цього ручна оцінка.
  - `thinkHit(words, value): number | null` — індекс першого слова, з яким збіг:
    - `thinkStem` відповіді дорівнює `thinkStem` слова чи синоніма, **або**
    - `textAccepts([stem слова чи синоніма], stem відповіді)` — той самий допуск до одруківки, що в типі `text`. Навмисна описка не рятує.
  - Порожня відповідь (після `thinkKey`) → `null`, але вона й так втрачає життя.
  - Латиниця: закінчення не знімаються (список лише кириличний), решта — так само.
- **Учасники.**
  - Учасник рушія — соло-гравець чи команда (`state.players`).
  - Знімок `lives` на відкритті кожного запитання (`openThink`):
    - перше запитання раунду — кожен учасник (крім глядача-автора автопілота) отримує `round.lives`;
    - далі — `thinkLivesAfter(попереднє)` для тих, хто вже був;
    - **новенький** (пізній гравець 13b чи нова команда) — `min` життів живих на цю мить (≥ 1). Якщо живих немає, раунд уже скінчився.
  - Хто приєднався посеред питання, до наступного відкриття — глядач (`think_spectator`).
  - Вилучені ведучим (`removePlayer`) зникають з усіх розрахунків: фільтр за `state.players`, ключі `lives` не чіпаються.
  - Хто **не на зв'язку**, на розкритому запитанні без відповіді втрачає життя, як і порожня відповідь. Інакше вихід з гри був би найбезпечнішим ходом.
- **Хто відповідає** (`submitAnswer`, гілка `think` поряд із `truth`):
  - тип відповіді `think` (інакше `type_mismatch`), текст ≤ `LIMITS.thinkWord` після `replace(/\s+/g,' ').trim()` (інакше `think_word`);
  - учасника немає в `play.think.lives` → `think_spectator`; `lives === 0` → `think_out`;
  - порожній текст → `think_word` (порожнє «надіслати» неможливе; мовчання = порожня відповідь);
  - одна відповідь на питання (`already_answered`).
  - Командна гра: відповідає той, кого наявний `team-act` дає за команду (капітан чи відповідач 12g). Запис — на команду.
- **Автозакриття.**
  - **З ведучим** раннього закриття «усі відповіли» в раунді `think` **немає**: таймер іде до кінця, щоб ведучий встиг дописати слова (специфікація: «після кінця таймера слова фіксуються»). Ведучий може закрити раніше кнопкою «Закрити» (`host:lock`).
  - **В автопілоті** — звичайне раннє закриття: чекають живих присутніх учасників.
- **Слова ведучого** — `setThinkWords(state, words, now)` замінює **весь** список:
  - `phase 'question'` — будь-який список 0–3 слів;
  - `phase 'locked'` — лише якщо поточний список порожній і новий непорожній (після таймера ведучий вписує слова один раз). Інакше `think_words_closed`;
  - `reveal` і далі — `think_words_closed`; не запитання `think` — `wrong_phase`;
  - слова зводяться (`trim`, пробіли), порожні синоніми відкидаються. Слово > 40, синонімів > 5, слів > 3, повтор `thinkKey` → `think_word`;
  - той самий список → `ok(state)` без змін (`toBe`).
- **Розкриття:**
  - `next` з `locked` у раунді `think` без слів **у грі з ведучим** → `think_no_words` (кнопка «Показати» неактивна).
  - В автопілоті гейту немає: запуск блокує `autopilotCheck`, а запобіжник не дає грі зависнути — без слів втрачають лише порожні.
  - Успішний `next` ставить `revealed: true`.
- **Ручна оцінка.**
  - `override(state, actorId, grade)` на `reveal` запитання `think`: `'wrong'` = збіг, `'correct'` = не збіг (запис `overridden: true`); `'partial'` → `partial_disabled`.
  - Порожня чи відсутня відповідь → `not_found`: її не можна «зарахувати».
  - На `question`/`locked` → `wrong_phase`. Після `reveal` (наступне запитання, `leaderboard`, `round_end`) → `wrong_phase`.
  - Апеляцій немає (`APPEAL_ROUNDS` без `think`), скасування 12a теж немає (`UNDOABLE_ROUNDS` без `think`).
- **Життя й вибування.**
  - Втрата на запитанні = учасник живий на відкритті (`lives > 0`), запитання `revealed`, і (немає запису, або `grade === 'wrong'`).
  - `thinkLivesAfter(play)` = `lives − втрата`.
  - Номер вибування — номер запитання раунду (від 1), на якому життя стали 0.
- **Кінець раунду** — `thinkOver(state)`, перевіряє `nextQuestion` (як `survivalOver`):
  - живих після останнього розкритого запитання 0, **або**
  - учасників першого запитання раунду ≥ 2, і живих ≤ 1.
  - Соло (на першому запитанні 1 учасник) грає, поки є життя й питання. Новенькі не перемикають режим.
  - Закінчились питання — звичайний `finishRound`.
  - «Завершити раунд» ведучим (`host:end-round`) на `question`/`locked` — це запитання не розкрите й життів не забирає.
- **Місця** — `thinkPlaces(state, roundIndex)`, учасники — ключі `lives` хоч одного запитання раунду, ще в `state.players`:
  1. дожили (останні життя > 0) — вище за всіх вибулих, між собою — більше життів вище;
  2. вибулі — пізніший номер вибування вище;
  3. рівні — спільне місце (спортивне: 1, 1, 3). Звідси автоматично: «усі живі втратили останнє життя на одному питанні» → вони ділять найвище місце серед себе (1-ше, якщо живих не лишилось).
  - Порядок рядків у спільному місці — порядок `state.players`.
- **Очки** — `thinkPoints(P, n, place)`:
  - `n === 1` → дожив `P`, вибув `0`;
  - інакше `round(P × (n − place) / (n − 1))`. Перевірка: P = 10 000, n = 4 → 10 000 · 6 667 · 3 333 · 0.
  - Нарахування — `awardThinkPlaces(state, now)` у `finishRound` (і в шляху «Завершити гру», де вже кличеться `awardSurvivalBonus`):
    - кожному з `points > 0` — `addAdjustment(…, points, now, 'think')`;
    - ідемпотентно: коригування `think` цього `roundIndex` уже є → без нових.
- **Бафи й дебафи вимкнені:**
  - `roundOff` → `'off_think'`, крамниця дебафів закрита на весь раунд;
  - запасних (`swap`) немає;
  - `AWAY_PENALTY_ROUNDS`, `UNDOABLE_ROUNDS`, `APPEAL_ROUNDS` раунд не додають;
  - підказка рівня (`perks.ts`) → `unfit`;
  - цікавинки (`facts.ts`) записів `think` не рахують;
  - серій немає (`DEFAULT_RULES`).
- **Досягнення й статистика.** Записи `think` мають `points: 0` і `grade` «безпечно/збіг», тож вони **не** йдуть у лічильники «правильних відповідей», точності, швидкості й серій. Нових досягнень немає. `all_rounds` і `all_types` ростуть самі (`ROUND_TYPES.length`, `QUESTION_TYPES.length`), тести з точним числом оновити з коментарем «35: новий раунд і тип think».
- **Автопілот:**
  - `AUTOPILOT_BLOCKS = ['think_words']`; `autopilotCheck` дає `{ code: 'think_words', rounds }` для кожного раунду `think`, де хоч одне запитання має 0 слів;
  - `convert` — `case 'think'` без змін;
  - **автор вікторини в раунді `think` — глядач**:
    - соло: його гравця немає в `lives`;
    - командна гра: `team-act` у раунді `think` не дає діяти автору. Якщо він той, хто відповідає, — діє наступний присутній учасник команди за порядком. Команда, де автор — єдиний учасник, — глядач (немає в `lives`).
  - в інших раундах автор грає як звичайно;
  - розкриття — як завжди (`moveOf`: `locked` → `next` через `AUTOPILOT_MS.locked`).
- **Помилки** (`ErrorCode`): `'think_no_words'`, `'think_words_closed'`, `'think_out'`, `'think_spectator'`, `'think_word'`; проблеми схеми `'think_type'`, `'think_round'`, `'think_words_dup'`.
- **Сцена під час питання** бачить лише: тему, таймер, ряд учасників із ❤️ (життя на відкритті) і позначку «відповів» без тексту.
- **Розкриття.** Слова ведучого бачать усі: головні великим, синоніми дрібно. Видно відповіді всіх живих (текст чи «—»), вердикт `safe`/`hit`/`empty` і життя після.
- **Множина.** Тексти з числом життів — через значок (`❤️ {count}`, `−1 ❤️`), без форм множини.

## Порядок збирання

- Задача 1 додає `'think'` у `ROUND_TYPES`, `QUESTION_TYPES` і `answerSchema`. Через вичерпні `Record`/`switch` у `apps/web` `tsc -p apps/web` у задачах 1–6 не проходить. Для них перевірка — `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Від задачі 7 — повний `pnpm typecheck`.
- Залежності:
  - 2 — від 1;
  - 3 — від 2;
  - 4 — від 3;
  - 5 — від 4;
  - 6 — від 5;
  - 7 — від 1 і 6;
  - 8 — від 7;
  - 9 — від 1 (можна паралельно з 2–8, але мерджити після 6);
  - 10 — остання.
- **Складна робота рушія:** задачі 3 і 4 (хід, слова ведучого, оцінка, життя, місця, автор-глядач у командах). Ревізор читає їх уважно проти «Рішень плану».

## Фокус рев'ю

1. **Спойлер слів і чужих відповідей.** До `reveal` слова ведучого (`question.words`, `play.think.words`) і тексти відповідей інших учасників є **лише** в зрізі ведучого. `JSON.stringify` зрізу сцени, кожного телефона (зокрема автора автопілота, вибулого й товариша по команді), ack `player:answer` і `host:think-words` (ack ведучого — `{ ok: true }`), а також подій менеджера (`this.emit`) на `intro`/`question`/`locked` не містять жодного слова чи синоніма. Тести: задача 5, `the stage and phones never see the words before reveal`; задача 6, `think words reach only the host`.
2. **М'яке порівняння й ручна оцінка.**
   - Закінчення, апострофи, регістр, пробіли, одруківки.
   - Короткі слова не обрізаються до 1–2 літер («кіт», «ліс»), цифри — без допуску.
   - Ручна оцінка (`overridden`) переживає кожен наступний `withTotals` і перезапуск.
   Тести: задача 2, `endings, apostrophes and case match`, `short words keep their stem`; задача 3, `a host override sticks`.
3. **Життя, новенькі, вилучення, нічиї.** Новенький отримує мінімум живих. Вилучений зникає з місць і `n`. «Завершити раунд» на відкритому запитанні не забирає життів. Спільні місця беруть очки вищого. Усі вибули на одному питанні — 1-ше місце. Тести: задача 4, `places and points follow the owner's formula`, `a newcomer gets the weakest living lives`, `everyone out on one question shares first place`.
4. **Гонки зі словами й таймером.** Слова, надіслані в мить, коли таймер закрив запитання: на `locked` з непорожнім списком → `think_words_closed`, з порожнім — приймаються один раз. «Показати» без слів відмовляє з ведучим і не блокує автопілот. Тести: задача 3, `the host edits words only while the timer runs, once after it if empty`, `reveal waits for a word with a host, not in autopilot`.
5. **Відновлення.** Знімок на `question` з дописаними в грі словами, `lives` і записами відновлюється тим самим. Після відновлення на `reveal` вердикти й ручні оцінки ті самі. Тести: задача 4 (`restore.test.ts`) і задача 6 (`restart.test.ts`).

---

### Задача 1. Спільне: тип і раунд think, межі, відповідь, помилки, подія, бриф, автопілот

**Files:**
- Modify:
  - `packages/shared/src/quiz.ts`:
    - `LIMITS` (межі з «Рішень плану»);
    - `thinkWordSchema`, гілка `think` у `questionSchema`, `thinkRoundSchema`;
    - `ROUND_TYPES` (`'think'` після `'survival'`), `roundSchema`, `rulesOf` (`DEFAULT_RULES`);
    - `superRefine`: `think_type`, `think_round`, `think_words_dup`.
  - `packages/shared/src/question-types.ts`: `'think'` у кінці `QUESTION_TYPES`; запис `QUESTION_TYPE_TRAITS.think`:
    - `rounds: ['think']`, `simple: false`, `reveal: false`, `unscored: false`, `puzzle: false`, `proximity: false`, `wholeRow: false`;
    - `speed: false`, `progress: false`, `hostGraded: true`, `teamWide: false`;
    - `buffs` усі `false`, `time: { min: 'minTime', max: 'maxTime' }`.
  - `packages/shared/src/answer.ts`: `{ type: 'think', value: z.string().max(LIMITS.thinkWord * 2).refine(isStorable, UNSTORABLE) }` (обрізає й міряє рушій).
  - `packages/shared/src/think.ts` (новий): `thinkKey`, `thinkStem`, `THINK_ENDINGS`, `thinkWordsIssue(words): 'think_words_dup' | null`.
  - `packages/shared/src/game.ts`:
    - `ErrorCode` + `'think_no_words' | 'think_words_closed' | 'think_out' | 'think_spectator' | 'think_word'`;
    - `BuffWhy` + `'off_think'`, `AdjustmentSource` + `'think'`.
  - `packages/shared/src/events.ts`: `thinkWordsEventSchema = z.object({ words: z.array(thinkWordSchema).max(LIMITS.maxThinkWords) })`, `'host:think-words'` у `ClientToServerEvents`.
  - `packages/shared/src/breakdown.ts`: `'think'` у `SCORE_SOURCES`, `answerSource`.
  - `packages/shared/src/round-brief.ts`: `think: { lives: number; points: number; count: number } | null`.
  - `packages/shared/src/facts.ts`: `factLimitMs` → `null` для `think`.
  - `packages/shared/src/autopilot.ts`: `AUTOPILOT_BLOCKS = ['think_words']`; `autopilotCheck` повертає `blocked`; `convert` — `case 'think'` без змін.
  - `packages/shared/src/index.ts`.
- Create: `packages/shared/src/think.test.ts`
- Test: `packages/shared/src/quiz.test.ts`, `question-types.test.ts` (меню раундів), `autopilot.test.ts`, `breakdown.test.ts`, `achievements.test.ts`, тест брифу (де він є)

**Interfaces:**
- Produces:
  ```ts
  export const thinkWordSchema = z.object({
    word: z.string().trim().min(1).max(LIMITS.thinkWord).refine(isStorable, UNSTORABLE),
    synonyms: z.array(z.string().trim().min(1).max(LIMITS.thinkWord).refine(isStorable, UNSTORABLE)).max(LIMITS.maxThinkSynonyms),
  });
  export type ThinkWord = z.infer<typeof thinkWordSchema>;
  // questionSchema: z.object({ ...base, type: z.literal('think'), words: z.array(thinkWordSchema).max(LIMITS.maxThinkWords) })
  /** «Думай інакше» (35): N життів, сума P за місця, лише запитання think. */
  export const thinkRoundSchema = z.object({
    id, type: z.literal('think'), title, description: …optional(),
    lives: z.number().int().min(LIMITS.minThinkLives).max(LIMITS.maxThinkLives),
    points: z.number().int().min(0).max(LIMITS.maxThinkPoints),
    questions: z.array(questionSchema).min(LIMITS.minThinkQuestions).max(LIMITS.maxThinkQuestions),
  });
  export type ThinkRound = z.infer<typeof thinkRoundSchema>;
  export function thinkKey(value: string): string;   // "  П’ЯТЬ " → 'пять'
  export function thinkStem(value: string): string;  // 'Фіолетова' → 'фіолетов'
  export const THINK_ENDINGS: readonly string[];     // список з «Рішень плану», від довших до коротших
  export function thinkWordsIssue(words: readonly ThinkWord[]): 'think_words_dup' | null;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `think.test.ts`:
    - `keys ignore case, apostrophes and spaces` — `thinkKey("  П’ЯТЬ ")`, `thinkKey("пʼять")`, `thinkKey("п'ять")` — усі `'пять'`;
    - `endings come off, the stem stays at least three letters`:
      - `thinkStem('фіолетовий') === thinkStem('Фіолетова') === thinkStem('фіолетові') === 'фіолетов'`;
      - `thinkStem('яблуком') === 'яблук'`;
      - `thinkStem('кіт') === 'кіт'`, `thinkStem('ліс') === 'ліс'`, `thinkStem('море') === 'мор'`;
      - `thinkStem('темно синій') === 'темн син'`;
    - `latin words keep their endings` — `thinkStem('Blue') === 'blue'`;
    - `duplicates across words and synonyms` — `thinkWordsIssue([{ word: 'Червоний', synonyms: [] }, { word: 'синій', synonyms: ['червона'] }])` дорівнює `'think_words_dup'` (той самий `thinkStem`); без повтору — `null`.
  - `quiz.test.ts`:
    - `accepts a think round` — 3 запитання `think` (одне з 0 слів, одне з 3 словами й синонімами), `lives: 3`, `points: 10000` проходять;
    - `refuses broken lives, points and words`:
      - `lives: 0` і `11`, `points: 10001`;
      - 4 слова;
      - синонім 41 символ;
      - 2 запитання (менше `minThinkQuestions`);
    - `think questions live only in a think round` — `single` у раунді `think` → `think_type`; `think` у класиці → `think_round`;
    - `duplicate words in one question` → `think_words_dup`;
    - `rules of a think round are the defaults` — `rulesOf(think)` дорівнює `DEFAULT_RULES`;
    - `old quizzes still parse`.
  - `question-types.test.ts`: меню `think` дорівнює `['think']`, і жодне інше меню не має `'think'`.
  - `autopilot.test.ts`, `a think question without words blocks the autopilot`:
    - вікторина `[classic, think (q2 без слів), think (усі зі словами)]` → `autopilotCheck(quiz).blocked` дорівнює `[{ code: 'think_words', rounds: [1] }]`;
    - `changed` без `think`;
    - `autopilotQuiz` раунд `think` не змінює (`toEqual`).
  - `breakdown.test.ts`: `answerSource('think') === 'think'`.
  - Бриф: `roundBrief(think)` → `think: { lives: 3, points: 10000, count: 3 }`; в інших раундах — `null`.
  - `achievements.test.ts`: числа `all_rounds`/`all_types` з коментарем «35: новий раунд і тип think».

- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2`. Очікується FAIL.

- [ ] **Step 3: Implement** блок Interfaces і зміни з «Files». Вичерпні `Record`/`switch` за типом раунду й запитання в `packages/shared` покаже `tsc -p packages/shared`.

- [ ] **Step 4: Run** `pnpm test --project shared --maxWorkers=2 && tsc -p packages/shared`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): 35 think round — think question with 0–3 host words, lives and place points, soft word keys, think answer, events, errors, autopilot block when words are missing"
```

---

### Задача 2. Рушій: м'яке порівняння й вердикти

**Files:**
- Create: `packages/engine/src/think.ts` (лише порівняння; решта — задачі 3–4), `packages/engine/src/think-match.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `thinkKey`, `thinkStem`, `ThinkWord` (задача 1); `textAccepts` (`check.ts`).
- Produces:
  ```ts
  /** Індекс першого слова ведучого, з яким збігається відповідь (стебло = стеблу слова чи синоніма, або textAccepts на стеблах); порожня — null. */
  export function thinkHit(words: readonly ThinkWord[], value: string): number | null;
  export type ThinkVerdict = 'safe' | 'hit' | 'empty';
  ```

- [ ] **Step 1: Write the failing tests** (`think-match.test.ts`). Слова: `[{ word: 'червоний', synonyms: ['багряний'] }, { word: 'синій', synonyms: ['блакитний'] }, { word: 'фіолетовий', synonyms: [] }]`.
  - `endings, apostrophes and case match`:
    - `thinkHit(words, 'Фіолетова') === 2`;
    - `thinkHit(words, ' ЧЕРВОНІ ') === 0`;
    - `thinkHit(words, 'Блакитна') === 1`;
    - `thinkHit([{ word: "п'ять", synonyms: [] }], 'пʼять') === 0`.
  - `typos do not save you` — `thinkHit(words, 'червониий') === 0`, `thinkHit(words, 'фиолетовий') === 2` (допуск `textAccepts`).
  - `other words are safe` — `'зелений'`, `'жовтий'`, `'оранжевий'` → `null`.
  - `short words keep their stem` — `thinkHit([{ word: 'кіт', synonyms: [] }], 'кит') === null` (інша перша голосна — допуск на 3 літери 0), `thinkHit([{ word: 'ліс', synonyms: [] }], 'ліси') === 0`.
  - `digits need an exact match` — `thinkHit([{ word: '7', synonyms: [] }], '8') === null`, `'7'` → `0`.
  - `empty is no hit` — `''`, `'   '` → `null`.
  - `no words — nobody hits` — `thinkHit([], 'червоний') === null`.

- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 src/think-match.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** `thinkHit` за «Рішеннями плану» («М'яке порівняння»). `textAccepts` не міняти: його `typoBudget` дає 0 описок для стебел коротших за 5 літер, тож «кіт»/«кит» не збігаються самі. Стебла: «горобець» → `горобец`, «горобці» → `горобц` — збіг через одну описку (задача 10 це перевіряє).

- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 src/think-match.test.ts && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/think.ts packages/engine/src/think-match.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): 35 think soft match — endings, apostrophes, case and typos against host words and synonyms"
```

---

### Задача 3. Рушій: відкриття, відповіді, слова ведучого, розкриття, оцінка (складна)

**Files:**
- Create: `packages/engine/src/game.think.test.ts`
- Modify:
  - `packages/engine/src/think.ts`: `thinkRoundOf`, `thinkPlayOf`, `openThink`, `setThinkWords`, `thinkVerdicts`, `withThinkGrades`;
  - `packages/engine/src/game.ts`:
    - `Play.think?`, `ThinkPlay` (з «Архітектури»);
    - `openQuestion` (`think: openThink(state)`), `shuffles` (`false`), `speedOn` (`false`);
    - `submitAnswer` (гілка `think`), `autoLock` (з ведучим — без раннього закриття, в автопілоті — живі присутні учасники);
    - `next` (`locked` → гейт `think_no_words` і `revealed: true`), `override` (гілка `think`), `withTotals` (`withThinkGrades` першим);
  - `packages/engine/src/answerer.ts` (звичайні правила 12g — перевірити, що `think` не потрапляє в `freeForAll`);
  - `packages/engine/src/live.ts` (рядок ведучого: вердикт `hit`/`safe` з `thinkHit` наживо);
  - `packages/engine/src/buffs.ts` (`'off_think'`), `debuffs.ts` (крамниця закрита в раунді), `perks.ts` (`unfit`), `away.ts`/`undo.ts`/`appeal.ts` (списки раундів без `think`), `facts.ts` (записи `think` не рахуються), `splash.ts` (вхід `'round'`, запитання `'question'`);
  - `packages/engine/src/testing/fixtures.ts`: `thinkRound(id, questions, options?)` (`lives: 3`, `points: 3000`), `think(id, words, options?)` (`timeLimit: 30`, `points: 0`);
  - `packages/engine/src/index.ts`.
- Test: `packages/engine/src/game.buffs.test.ts`, `live.test.ts`

**Interfaces:**
- Consumes: задачі 1–2; `presentPlayers`, `recordOf`, `withCurrentPlay`, `limitMsOf`, `teamsOn`.
- Produces:
  ```ts
  export function thinkRoundOf(state: GameState): ThinkRound | null;
  export function thinkPlayOf(state: GameState, index?: number): (Play & { think: ThinkPlay }) | null;
  /** ThinkPlay нового запитання: words — копія question.words; lives — знімок (див. «Учасники»; у цій задачі — лише перше запитання й «попереднє», новенькі — задача 4). */
  export function openThink(state: GameState, question: Extract<Question, { type: 'think' }>): ThinkPlay;
  /** Слова ведучого: правила «Слова ведучого». think_words_closed / think_word / wrong_phase. */
  export function setThinkWords(state: GameState, words: ThinkWord[], now: number): Result;
  /** Вердикт кожного учасника з lives > 0 на запитанні index: запис overridden — за grade; інакше thinkHit; немає запису — 'empty'. */
  export function thinkVerdicts(state: GameState, index: number): Record<string, ThinkVerdict>;
  /** Перераховує grade записів запитань think (не overridden): hit → 'wrong', safe → 'correct'; points завжди 0. */
  export function withThinkGrades(state: GameState): GameState;
  ```

- [ ] **Step 1: Write the failing tests.** Вікторина `makeRoundsQuiz([classicRound('r1', [single]), thinkRound('r2', [think('t1', [червоний, синій]), think('t2', []), think('t3', [зелений])])])`. Гравці Олена, Тарас, Віра, Хосе. `t0 = 1_000_000`. Вхід у раунд `r2` — через `next`.
  - `game.think.test.ts`:
    - `the first question gives everyone the round's lives` — `play.think` дорівнює `{ words: [червоний, синій], lives: { p1: 3, p2: 3, p3: 3, p4: 3 }, revealed: false }`; `endsAt === startedAt + 30_000`; `presented` дорівнює `[]`.
    - `one word per player, refused for the wrong type, too long and empty`:
      - `submitAnswer(p1, { type: 'think', value: '  Зелений ' })` → запис `answer.value === 'Зелений'`, `points: 0`;
      - повтор → `already_answered`;
      - `{ type: 'text', … }` → `type_mismatch`;
      - 41 символ → `think_word`;
      - `'   '` → `think_word`;
      - стан після відмови `toBe` попередній.
    - `with a host everyone answering does not close the question` — усі четверо відповіли → `phase === 'question'`; `tick` після `endsAt` → `locked`.
    - `in autopilot everyone answering closes it` — стан з `autopilot` → четверта відповідь → `locked`.
    - `the host edits words only while the timer runs, once after it if empty`:
      - `t1` на `question`: `setThinkWords([фіолетовий])` → `play.think.words` дорівнює `[фіолетовий]`, той самий список → `toBe`;
      - 4 слова, повтор, 41 символ → `think_word`;
      - на `locked` → `think_words_closed`;
      - на `t2` (порожньо) після таймера: `setThinkWords([])` → `think_words_closed`, `setThinkWords([кіт])` → ok, ще раз → `think_words_closed`;
      - на `reveal` → `think_words_closed`; поза `think` → `wrong_phase`.
    - `reveal waits for a word with a host, not in autopilot`:
      - `t2` без слів на `locked` → `next` → `think_no_words`;
      - після `setThinkWords` → `reveal`, `revealed: true`;
      - той самий стан з `autopilot` → `next` без слів → `reveal`.
    - `verdicts on reveal` — `t1` (червоний, синій): Олена «Червона», Тарас «зелений», Віра мовчить, Хосе «Синя» → `thinkVerdicts` дорівнює `{ p1: 'hit', p2: 'safe', p3: 'empty', p4: 'hit' }`; записи: `p1.grade 'wrong'`, `p2.grade 'correct'`, усі `points: 0`; рахунки гравців не змінились.
    - `a host override sticks`:
      - `override(p1, 'correct')` → `safe`, `overridden: true`;
      - `override(p2, 'wrong')` → `hit`;
      - `override(p3, …)` (мовчав) → `not_found`;
      - `'partial'` → `partial_disabled`;
      - на `question`/`locked` → `wrong_phase`;
      - після `next` (наступне запитання) `override` минулого → `wrong_phase`, а вердикти минулого ті самі.
    - `live host rows show the match before reveal` — `liveRows` ведучого на `question` має `hit: true` для Олени й `false` для Тараса; після `setThinkWords([зелений])` — навпаки.
    - `no speed, no streak, no buffs, no shop` — швидка й повільна відповіді — ті самі `points: 0`; баф → `off_think`; крамниця → закрита; `perks` → `unfit`.
  - `game.buffs.test.ts`: `buffs are off in the think round` → `'off_think'`.

- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2`. Очікується FAIL.

- [ ] **Step 3: Implement** за «Рішеннями плану» («Хто відповідає», «Автозакриття», «Слова ведучого», «Розкриття», «Ручна оцінка»). Переглянути всі вичерпні `switch`/`round.type ===` у `packages/engine/src` (`grep -n "type === 'truth'\|type === 'survival'" packages/engine/src/*.ts`). Для кожного вирішити: `think` — як класика чи своя гілка. Записати рішення одним рядком коментаря там, де воно не очевидне.

- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 35 think question flow — one word each, host words editable while the timer runs, reveal waits for a word, soft-match verdicts, host override, buffs off"
```

---

### Задача 4. Рушій: життя, вибування, кінець раунду, місця й очки, новенькі, команди, автопілот, відновлення (складна)

**Files:**
- Create: `packages/engine/src/game.think-round.test.ts`
- Modify:
  - `packages/engine/src/think.ts`: `thinkLivesAfter`, `thinkAlive`, `thinkOver`, `thinkPlaces`, `thinkPoints`, `awardThinkPlaces`; `openThink` — новенькі й автор-глядач;
  - `packages/engine/src/game.ts`: `nextQuestion` (`thinkOver` → `undefined`), `finishRound` і шлях «Завершити гру» (`awardThinkPlaces` поряд з `awardSurvivalBonus`);
  - `packages/engine/src/team-act.ts` (автор автопілота не діє за команду в раунді `think`);
  - `packages/engine/src/testing/autopilot.ts` (бот пише слово за кожного живого учасника, крім автора);
  - `packages/engine/src/restore.ts` (лише коментар до `READABLE_STATE_VERSIONS`);
  - `packages/engine/src/index.ts`.
- Test: `packages/engine/src/game.teams.test.ts`, `game.autopilot.test.ts`, `restore.test.ts`, `saved.test.ts`

**Interfaces:**
- Consumes: задачі 1–3; `addAdjustment`, `afterQuestionNow`, `addLatePlayer`, `removePlayer`.
- Produces:
  ```ts
  /** Життя учасника після запитання index (розкрите — мінус втрата; ні — як на відкритті); не учасник — null. */
  export function thinkLivesAfter(state: GameState, index: number, actorId: string): number | null;
  /** Живі зараз у поточному раунді think (у порядку state.players): за останнім запитанням раунду; поза раундом — []. */
  export function thinkAlive(state: GameState): string[];
  /** Раунд скінчено достроково: див. «Кінець раунду». */
  export function thinkOver(state: GameState): boolean;
  export interface ThinkPlaceRow { id: string; place: number; lives: number; /** номер запитання раунду (від 1), де вибув; null — дожив */ outAt: number | null; points: number }
  /** Місця раунду roundIndex (порядок: місце, потім state.players), з очками thinkPoints. */
  export function thinkPlaces(state: GameState, roundIndex?: number): ThinkPlaceRow[];
  export function thinkPoints(total: number, n: number, place: number, alive: boolean): number;
  /** Кінець раунду think: коригування 'think' на очки місць; ідемпотентно; поза раундом — стан без змін. */
  export function awardThinkPlaces(state: GameState, now: number): GameState;
  ```

- [ ] **Step 1: Write the failing tests.** Стан задачі 3, `lives: 2`, `points: 10_000`, 5 запитань зі словами.
  - `game.think-round.test.ts`:
    - `a hit and an empty answer cost a life; zero lives is out`:
      - після `t1` (Олена — збіг, Віра мовчить) → на `t2` `lives` дорівнює `{ p1: 1, p2: 2, p3: 1, p4: 2 }`;
      - після `t2` (Олена — збіг) → `p1: 0`;
      - Олена на `t3` → `think_out`;
      - `thinkAlive` без Олени.
    - `an unrevealed question takes no lives` — `host:end-round` на `locked` `t2` → `round_end`, `t2` не зменшив життів у `thinkPlaces`.
    - `the round ends when one is left of many` — четверо → троє вибувають → `next` з `reveal` → `round_end`, решта запитань не зіграні.
    - `everyone out on one question shares first place`:
      - двоє гравців по 1 життю, обидва збіглися на `t1` → `round_end`;
      - `thinkPlaces` — обидва `place: 1`, `points: 10_000`.
    - `places and points follow the owner's formula`:
      - 4 гравці: Хосе дожив з 2, Тарас дожив з 1, Віра вибула на 3-му, Олена — на 2-му (питання скінчились) → місця `[Хосе 1, Тарас 2, Віра 3, Олена 4]`, очки `[10_000, 6_667, 3_333, 0]`;
      - коригування `source: 'think'` у рахунках;
      - другий виклик `awardThinkPlaces` — без нових коригувань.
    - `ties share the higher place and its points` — двоє дожили з 2 життями, третій вибув → місця `[1, 1, 3]`, очки `[10_000, 10_000, 0]`; двоє вибули на одному питанні після переможця → `[1, 2, 2]`, очки `[10_000, 5_000, 5_000]`.
    - `a solo player walks the whole round`:
      - один гравець, `lives: 2`, жодного збігу → грає всі 5 запитань → `P`;
      - інший стан: дві втрати → вибув на 2-му → `round_end` одразу, `0`.
    - `a newcomer gets the weakest living lives` — продовжена гра: після `t2` на точці відпочинку `addLatePlayer(p5)` → на `t3` `lives.p5` дорівнює мінімуму живих (1); пізній гравець на `question` до свого першого питання → `think_spectator`.
    - `a newcomer does not switch a solo round` — соло-раунд + новенький → «один живий» раунд не закриває.
    - `removed players leave places and n` — вилучений Тарас після `t2` не входить у `thinkPlaces`, `n = 3`, очки за формулою для 3.
    - `the absent lose a life like the silent` — `setConnected(p4, false)` до `t1`, без відповіді → −1.
  - `game.teams.test.ts`, `teams play by captain with team lives and places` — дві команди: `lives` за id команд; капітан пише; некапітан → наявна відмова `team-act`; місця й очки — командні.
  - `game.autopilot.test.ts`:
    - `the autopilot author watches the think round`:
      - соло: автора немає в `lives`, його `player:answer` → `think_spectator`;
      - у класиці — грає;
      - бот проводить раунд до `finished`.
    - `in teams the author's teammate answers` — автор-капітан: за команду діє наступний присутній учасник; команда лише з автора — немає в `lives`.
  - `restore.test.ts`:
    - `keysOf<Play>` з `'think'`, `keysOf<ThinkPlay>()(['words', 'lives', 'revealed'])`;
    - `GAME_STATE_VERSION === 22`;
    - `a suspended think question keeps the host's words, lives and records` — `suspend` на `question` з дописаними словами → ті самі; на `reveal` з `override` → ті самі вердикти.

- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2`. Очікується FAIL.

- [ ] **Step 3: Implement** за «Рішеннями плану» («Учасники», «Життя й вибування», «Кінець раунду», «Місця», «Очки», «Автопілот»). Знімок `lives` — функція журналу й `state.players`, без нових полів `GameState`. Якщо без обов'язкового поля ніяк — **стоп, спитати контролера** (див. «Глобальні обмеження»).

- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): 35 think lives and places — elimination, early end, solo walks the round, ties share the higher place, place points, newcomers get the weakest lives, teams, the autopilot author watches"
```

---

### Задача 5. Рушій: зрізи — сцена, телефони, пульт, без спойлерів

**Files:**
- Modify: `packages/shared/src/views.ts` (типи нижче), `packages/engine/src/views.ts` (`stageView`, `playerView`, зріз учасника командної гри, `hostView`)
- Create: `packages/engine/src/views.think.test.ts`

**Interfaces:**
- Consumes: `thinkPlayOf`, `thinkVerdicts`, `thinkLivesAfter`, `thinkAlive`, `thinkPlaces`, `thinkRoundOf` (задачі 3–4).
- Produces (`shared/views.ts`):
  ```ts
  export interface ThinkRow {
    id: string; nickname: string;
    /** question/locked — життя на відкритті; reveal і далі — після запитання. */
    lives: number;
    out: boolean;
    /** Лише question/locked: чи вже відповів (без тексту). */
    answered: boolean;
    /** Лише reveal: текст відповіді ('' — порожньо), вердикт, чи втратив життя тут; інакше null/false. */
    answer: string | null; verdict: ThinkVerdict | null; lost: boolean;
  }
  export interface ThinkInfo {
    lives: number; points: number;
    /** Номер запитання раунду (від 0) і скільки їх у раунді; поза question…reveal — null. */
    index: number | null; total: number;
    rows: ThinkRow[];
    /** Лише reveal: слова ведучого (головне + синоніми). До reveal — null. */
    words: ThinkWord[] | null;
    /** Лише round_end раунду think. */
    places: (ThinkPlaceRow & { nickname: string })[] | null;
  }
  export interface HostThink extends ThinkInfo {
    /** question…reveal: поточні слова ведучого (play.think.words) — завжди, і до reveal. */
    draft: ThinkWord[];
    /** Можна змінити слова зараз (правила setThinkWords). */
    editable: boolean;
    /** locked: «Показати» дозволено (є слова або автопілот). */
    canReveal: boolean;
    /** question…reveal: відповіді наживо з позначкою збігу; немає відповіді — answer null. */
    answers: { id: string; nickname: string; answer: string | null; hit: boolean | null; overridden: boolean }[];
  }
  export interface PlayerThink {
    lives: number;
    /** spectator — не учасник цього запитання (автор автопілота, новенький до відкриття). */
    status: 'alive' | 'out' | 'spectator';
    /** Лише reveal: свій вердикт. */
    verdict: ThinkVerdict | null;
    /** Лише round_end: своє місце й очки. */
    place: { place: number; points: number } | null;
  }
  // BaseView.think?: ThinkInfo; HostView.think?: HostThink; PlayerView.me.think?: PlayerThink — лише в раунді think (intro…round_end); поза ним ключа немає
  ```

- [ ] **Step 1: Write the failing tests** (стани задач 3–4):
  - `the stage and phones never see the words before reveal`:
    - на `intro`, `question` і `locked` `JSON.stringify` сцени й кожного телефона (зокрема Олени, яка вже відповіла, вибулого й соло-автора автопілота) не містить «червоний», «багряний» і жодної чужої відповіді («Зелений»);
    - `stageView.think.words === null`;
    - `question.words` у `PublicQuestion` немає;
    - після `setThinkWords([фіолетовий])` — так само без «фіолетовий».
  - `the host sees words and live matches` — `hostView.think.draft` дорівнює словам; `answers` з `hit`; `editable: true` на `question`, `false` на `locked` з словами; `canReveal: false` на `locked` без слів, `true` після слова.
  - `the stage row shows hearts and who answered, not what` — `rows` на `question`: `{ nickname: 'Олена', lives: 3, answered: true, answer: null, verdict: null }`.
  - `reveal shows words, every answer and lost hearts` — `words` дорівнює словам ведучого; рядок Олени `{ answer: 'Червона', verdict: 'hit', lost: true, lives: 2 }`; Віри `{ answer: '', verdict: 'empty', lost: true }`; телефон Тараса `me.think.verdict === 'safe'`.
  - `the eliminated and the spectator see their status` — `me.think.status` вибулої Олени `'out'`, автора автопілота `'spectator'`, новенького до відкриття `'spectator'`.
  - `the round end shows places with points` — `places` з `nickname`, `place`, `points`; `me.think.place` Хосе `{ place: 1, points: 10_000 }`.
  - `teams see team lives` — `rows` за командами; зріз учасника має `me.think` своєї команди.
  - `other rounds have no think key` — класика, «Вибування», «Правда про гравця»: ключа `think` немає ні в одному зрізі.

- [ ] **Step 2: Run** `pnpm test --project engine --maxWorkers=2 src/views.think.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `survivalInfo`/`playerSurvival` і `optional('truth', …)` у `views.ts`. Відповіді в `HostThink.answers` і `ThinkRow.answer` беруться з `play.answers[actor].answer.value`.

- [ ] **Step 4: Run** `pnpm test --project engine --maxWorkers=2 && pnpm test --project shared --maxWorkers=2 && tsc -p packages/shared && tsc -p packages/engine`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/views.ts packages/engine
git commit -m "feat(engine): 35 think views — hearts and answered marks for everyone, words and live matches only for the host, words and answers on reveal, places table at the round end"
```

---

### Задача 6. Сервер: подія слів, частота, автор, перезапуск, запис, історія, статистика, запуск автопілота

**Files:**
- Modify:
  - `apps/server/src/socket.ts`: `on('host:think-words')` — `hostSide` → `run({ type: 'think-words', words })` з `thinkWordsEventSchema`;
  - `apps/server/src/rooms/manager.ts`:
    - `HostAction` + `{ type: 'think-words'; words: ThinkWord[] }` → `setThinkWords(…, this.now())`;
    - `RateKind` + `'think'` з `THINK_WORDS_PER_SECOND = 4` (понад → `too_soon`), до `CLEARED_ON_REMOVE` не додавати (ведучий не вилучається);
    - `author()` (кімната-автопілот) → `not_allowed` для `think-words`;
    - слова не пишуться в `this.emit` / логи;
  - `apps/server/src/db/schema.ts` (`PlayRef.think?: { words: ThinkWord[] }`), `apps/server/src/recorder.ts` (`writeGame` → фінальні `play.think.words`);
  - `apps/server/src/history.ts`, `packages/shared/src/history.ts`:
    - `GameQuestionResult.think?: { words: string[]; lives: Record<string, number> }`;
    - рядки відповідей з вердиктом `safe`/`hit`/`empty`;
    - підсумок раунду — місця (з коригувань `think`);
  - `apps/server/src/quiz-remove.ts` (`MIN_QUESTIONS.think: LIMITS.minThinkQuestions`);
  - лічильники досягнень і статистики: `apps/server/src/game-achievements.ts`, `anti-achievements.ts`, `mechanic-achievements.ts`, `achievements.ts`, `achievement-store.ts`, `history.ts`. Записи запитань `think` пропускати там, де рахуються правильні відповіді, точність, швидкість чи серії (`grep -n "grade === 'correct'\|accuracy\|timeMs" apps/server/src/*achievement*.ts apps/server/src/history.ts`);
  - `apps/server/src/account-routes.ts` — уже відмовляє `autopilot_blocked` за `blocked`; лише тест;
  - `apps/server/scripts/logic/check.ts` та інші вичерпні `switch` (покаже `tsc -p apps/server`).
- Test: `apps/server/src/socket.test.ts`, `apps/server/src/rooms/manager.think.test.ts` (новий), `manager.autopilot.test.ts`, `apps/server/src/restart.test.ts`, `recorder.test.ts`, `history.test.ts`, `account-routes.test.ts` (чи де тестується запуск автопілота), тест досягнень, де є точне число `all_rounds`/`all_types`

**Interfaces:**
- Consumes: задачі 1–5.
- Produces: `PlayRef.think?: { words: ThinkWord[] }`; `GameQuestionResult.think?: { words: string[]; lives: Record<string, number> }`; `THINK_WORDS_PER_SECOND = 4`.

- [ ] **Step 1: Write the failing tests:**
  - `socket.test.ts`, `host:think-words sets the words; players cannot`:
    - ведучий → ack `{ ok: true }`;
    - гравець шле `host:think-words` → `FORBIDDEN`;
    - 4 слова → `INVALID`.
  - `manager.think.test.ts`:
    - `think words reach only the host` — після `think-words` зрізи сцени й гравців (кадри `state`) і всі `RoomEvent` не містять слова; зріз ведучого — містить;
    - `words are rate limited` — п'ятий виклик за секунду → `too_soon`;
    - `the autopilot author cannot set words` → `not_allowed`;
    - `reveal without words is refused, then works` — `host:next` на `locked` → `think_no_words`; після слова → `reveal`.
  - `restart.test.ts`, `a restored think question keeps the host's words, lives and overrides` — збережено на `question` з дописаними словами → ті самі; на `reveal` після `override` → ті самі вердикти; гра доходить до місць з тими самими очками.
  - `recorder.test.ts`, `a think question records the final host words` — `plays[i].think.words` — дописані в грі, а не заготовлені; рядки відповідей `{ type: 'think', value }` з `points: 0`.
  - `history.test.ts`, `think questions show the words, the verdicts and the places` — `think.words` дорівнює `['червоний', 'синій']`; вердикти рядків; бали гравців — з коригувань `think`.
  - Тест досягнень, `think answers do not count as correct answers` — гра, де гравець «в безпеці» на 10 запитаннях `think`: лічильники правильних, точності й серій не ростуть.
  - Запуск автопілота, `a quiz with a wordless think question cannot start the autopilot` — `409 { error: 'autopilot_blocked' }`; з усіма словами — запускається.
  - `manager.autopilot.test.ts`, `the autopilot plays a think round with the author watching` — доходить до `finished`, коригування `think` є, автора в місцях немає.

- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 src/socket.test.ts src/rooms/manager.think.test.ts src/rooms/manager.autopilot.test.ts src/restart.test.ts src/recorder.test.ts src/history.test.ts`. Додати шляхи тестів досягнень і запуску автопілота. Очікується FAIL.

- [ ] **Step 3: Implement.** Обробник — за зразком `host:truth-hide`. Частота — за зразком `truth` у `RATE_LIMITS`.

- [ ] **Step 4: Run** тести з кроку 2, потім `pnpm test --project server --maxWorkers=2` і `tsc -p packages/shared && tsc -p packages/engine && tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server packages/shared/src/history.ts
git commit -m "feat(server): 35 think — host words event with rate limit, autopilot author refused, restored words and lives, final words in the record, history verdicts and places, think answers out of correct-answer stats"
```

---

### Задача 7. Веб: назва, пам'ятка, помилки, історія, довідка, запуск автопілота й редактор

**Files:**
- Create: `apps/web/src/editor/ThinkWordsEditor.tsx`, `apps/web/src/editor/ThinkWordsEditor.test.tsx`
- Modify:
  - `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_THINK`), `apps/web/src/locales/{en,pl,de,es,it,ar}.json`;
  - `apps/web/src/guide-text.ts` (`ROUND_ICONS.think: '🧠'`, `ROUND_NAMES.think`, `roundHow`), `apps/web/src/round-summary.ts`, `apps/web/src/pages/GameHistory.tsx`;
  - `apps/web/src/help/help-uk.ts` (`round.think.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (нові id, свідомо), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`;
  - `apps/web/src/pages/AutopilotLaunch.tsx` — під `autopilotBlocked` перелік блоків: `autopilotBlock_think_words` + `roundsText(issue.rounds)`, як у змінах;
  - `apps/web/src/editor/draft.ts`:
    - `newThinkRound()`, `newThinkQuestion()`;
    - проблеми: `problemThinkWordsDup`; меншість запитань — наявна проблема кількості;
  - `apps/web/src/editor/draft-storage.ts`, `apps/web/src/editor/type-menu.ts` (якщо меню типів тут);
  - `apps/web/src/editor/QuizEditor.tsx` (створення раунду, запитання — лише тип `think`);
  - `apps/web/src/editor/QuestionEditor.tsx` (поля `think` → `ThinkWordsEditor`; ціни немає);
  - `apps/web/src/editor/RoundSettings.tsx` (життя, сума P);
  - `apps/web/src/styles.css` (класи `think-`).
- Test: `guide-text.test.ts`, `round-summary.test.ts`, `pages/GameHistory.test.tsx`, `pages/AutopilotLaunch.test.tsx`, `editor/draft.test.ts`, `editor/QuizEditor.test.tsx`, `editor/type-menu.test.ts`, наявні `help-golden.test.ts`, `locales/checks.test.ts`, `source-scan.test.ts`

**Interfaces:**
- Consumes: `thinkRoundSchema`, `thinkWordSchema`, `thinkWordsIssue`, `LIMITS`, `RoundBrief.think`, `ErrorCode`, `AUTOPILOT_BLOCKS` (задача 1); `GameQuestionResult.think` (задача 6).
- Produces:
  ```ts
  export function newThinkRound(): ThinkRound; // { title: '', lives: LIMITS.defaultThinkLives, points: LIMITS.defaultThinkPoints, questions: [3 × newThinkQuestion()] }
  export function newThinkQuestion(): Extract<Question, { type: 'think' }>; // { text: '', words: [], timeLimit: LIMITS.defaultTime, points: 0, imageUrl: null, video: null }
  /** Редактор слів: до 3 рядків «слово + синоніми через кому»; «Додати слово»; попередження thinkNoWordsNote, коли слів 0. */
  export function ThinkWordsEditor(props: { words: ThinkWord[]; onChange: (words: ThinkWord[]) => void }): JSX.Element;
  ```
- uk-ключі (усі в `ADDED_THINK`; задача 8 дописує свої):
  ```ts
  roundTypeThink: 'Думай інакше',
  roundHow_think: 'Ведучий загадує слова на тему. Напишіть своє слово — але не те, що в ведучого: збіг або порожня відповідь забирає ❤️. Без життів — ви глядач. Хто протримається довше, отримає більше балів.',
  questionTypeThink: 'Слово на тему',
  buffWhy_off_think: 'У раунді «Думай інакше» бафів немає.',
  scoreSource_think: 'Думай інакше',
  err_think_no_words: 'Спершу впишіть хоча б одне слово ведучого.',
  err_think_words_closed: 'Слова вже не можна змінити.',
  err_think_out: 'У вас не лишилося життів — ви глядач.',
  err_think_spectator: 'У цьому питанні ви глядач.',
  err_think_word: 'Слово порожнє або задовге: до 40 символів.',
  summaryThink: '❤️ {lives} · {count} питань · за місця до {points}',
  thinkLivesLabel: 'Життя на старті',
  thinkPointsLabel: 'Бали за 1-ше місце',
  thinkWordsLabel: 'Слова ведучого',
  thinkWordLabel: 'Слово {index}',
  thinkSynonymsLabel: 'Синоніми через кому',
  thinkAddWord: 'Додати слово',
  thinkRemoveWord: 'Прибрати слово',
  thinkNoWordsNote: 'Слів немає — ведучий впише їх у грі. Гру без ведучого з таким питанням не запустити.',
  problemThinkWordsDup: 'Слова ведучого в одному питанні повторюються',
  autopilotBlock_think_words: 'У «Думай інакше» є питання без слів ведучого — бот не знає, що загадати.',
  thinkHistoryWords: 'Слова ведучого: {words}',
  thinkHistorySafe: 'в безпеці',
  thinkHistoryHit: 'збіг',
  thinkHistoryEmpty: 'без відповіді',
  ```
- Довідка `round.think`:
  - `title`, `what`;
  - `how.0–4`:
    - N життів на старті;
    - одне слово на тему;
    - слова ведучого — 1–3, із синонімами, заготовлені чи вписані під час питання;
    - збіг (без різниці регістру й закінчень) чи порожня відповідь — −1 ❤️; ведучий може зарахувати чи зняти збіг;
    - 0 життів — глядач.
  - `points.0–1`:
    - місця: дожили — вище, більше життів — вище; вибулі — хто пізніше;
    - очки від P до 0 рівними кроками; нічия — спільне місце;
  - `tip.0` — загадуйте очевидне: усі тягнуться до нього;
  - `limits.0–2`:
    - бафів немає;
    - соло грає весь раунд;
    - без ведучого — лише з заготовленими словами, автор вікторини дивиться.
  - `help-uk-golden.json` отримує рівно ці нові id.

- [ ] **Step 1: Write the failing tests:**
  - `guide-text.test.ts`: `ROUND_NAMES.think` → «Думай інакше».
  - `round-summary.test.ts`: бриф `{ lives: 3, points: 10000, count: 12 }` → рядок з «❤️ 3», «12» і «10000» (числа — як форматує наявний рядок).
  - `GameHistory.test.tsx`: запитання `think` → «Слова ведучого: червоний, синій», рядки «в безпеці»/«збіг»/«без відповіді».
  - `AutopilotLaunch.test.tsx`: `blocked: [{ code: 'think_words', rounds: [1] }]` → `autopilotBlocked` і рядок `autopilotBlock_think_words` з номером раунду 2; кнопка створення неактивна.
  - `draft.test.ts`:
    - `newThinkRound()` → `toMatchObject` з Interfaces;
    - повтор слів → `problemThinkWordsDup`;
    - чернетка з `think` після чистки проходить `quizSchema`.
  - `ThinkWordsEditor.test.tsx`:
    - `adds up to three words with synonyms` — «Додати слово» ×3 → кнопка зникає; «синій, блакитний» у синонімах → `onChange` з `synonyms: ['синій', 'блакитний']` (обрізано, без порожніх);
    - `warns when there are no words` — `words: []` → `thinkNoWordsNote`;
    - `fields keep maxLength 40`.
  - `QuizEditor.test.tsx`, `creates a think round with lives, points and word questions`:
    - додати «Думай інакше» → життя 3, бали 5000, три запитання типу «Слово на тему»;
    - меню типу запитання — лише цей тип;
    - збережено `{ type: 'think', lives: 3, points: 5000 }`.
  - `type-menu.test.ts`: `think` лише в раунді `think`.
  - `i18n.test.ts`: `ADDED_THINK`.

- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 src/guide-text.test.ts src/round-summary.test.ts src/pages src/editor src/i18n.test.ts src/help src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement.** Поля раунду — за зразком блоку `survival` у `RoundSettings.tsx`. Переклади 6 мов — природні, з тими самими плейсхолдерами; ar — з `dir` як в інших ключах. Вичерпні `switch` на телефоні, сцені й пульті отримують мінімальну гілку (`null`), повний UI — у задачі 8.

- [ ] **Step 4: Run** тести з кроку 2, `src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS: від цієї задачі повний typecheck зелений.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 35 think round name, briefing, errors, history lines, host help, autopilot block line and the editor — lives, place points, up to three host words with synonyms"
```

---

### Задача 8. Веб: телефон, сцена й пульт ведучого

**Files:**
- Create: `apps/web/src/screens/ThinkView.tsx`, `apps/web/src/screens/ThinkView.test.tsx`
- Modify:
  - `apps/web/src/screens/PlayerScreen.tsx` — `question`/`locked` раунду `think`: `ThinkInput` замість `AnswerInput`; `reveal` — `ThinkPhoneVerdict`; `round_end` — своє місце; `ThinkHearts` у шапці раунду;
  - `apps/web/src/screens/TeamWatch.tsx` — некапітан бачить чернетку капітана лише для читання;
  - `apps/web/src/screens/StageScreen.tsx` — `question`/`locked` → `ThinkStage`, `reveal` → `ThinkReveal`, `round_end` → `ThinkPlaces`;
  - `apps/web/src/screens/HostScreen.tsx`:
    - `question`/`locked`/`reveal` → `HostThinkWords` + `HostThinkAnswers` замість звичайних «Відповідей наживо»;
    - кнопка «Показати» на `locked` — `disabled={!think.canReveal}` з підказкою `err_think_no_words`;
  - `apps/web/src/styles.css` (класи `think-`; кольори лише змінними теми, перевірити `:root.is-light`), `apps/web/src/i18n.ts`, 6 json, `ADDED_THINK`.
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `StageScreen.test.tsx`, `HostScreen.test.tsx`, `TeamWatch.test.tsx`

**Interfaces:**
- Consumes: `ThinkInfo`, `HostThink`, `PlayerThink` (задача 5); `player:answer`, `host:think-words`, `host:override`, `host:next`; `errorText`, `Timer`, `signed()`.
- Produces:
  ```tsx
  /** Телефон: тема, одне поле (maxLength 40, enterKeyHint send), «Надіслати» → player:answer { type: 'think', value }; після — «Ваше слово: …». out/spectator — лише статус. */
  export function ThinkInput(props: { question: PublicQuestion; think: PlayerThink; disabled: boolean; send: Send }): JSX.Element;
  /** ❤️ × lives (згаслі — до round.lives), aria-label thinkHeartsLabel. */
  export function ThinkHearts(props: { lives: number; max: number; lost?: boolean }): JSX.Element;
  /** Телефон на reveal: «Ви в безпеці» / «Збіг: −1 ❤️» / «Без відповіді: −1 ❤️»; з 0 — «Ви вибули — тепер ви глядач». */
  export function ThinkPhoneVerdict(props: { think: PlayerThink }): JSX.Element | null;
  /** Пульт: до 3 рядків «слово + синоніми», «Зберегти слова» → host:think-words; поле не скидається новими зрізами, поки ведучий пише; !editable — лише читання. */
  export function HostThinkWords(props: { think: HostThink; send: Send; onError?: (text: string | null) => void }): JSX.Element;
  /** Пульт: учасник · відповідь · «збіг»/«в безпеці»; на reveal — «Зарахувати збіг» / «Зняти збіг» → host:override { playerId, grade: 'wrong' | 'correct' }. */
  export function HostThinkAnswers(props: { think: HostThink; phase: Phase; send: Send }): JSX.Element;
  /** Сцена на question/locked: тема великим, таймер, «Питання k з n», ряд учасників із ❤️ і ✓ «відповів». */
  export function ThinkStage(props: { view: StageView; offsetMs: number }): JSX.Element;
  /** Сцена (і телефони) на reveal: слова ведучого великим (синоніми дрібно), відповіді всіх; втрачені — підсвічені, ❤️ гасне (анімація лише без prefers-reduced-motion). */
  export function ThinkReveal(props: { think: ThinkInfo }): JSX.Element | null;
  /** Сцена й телефони на round_end: таблиця місць — місце, нік, ❤️ чи «вибув на k», очки. */
  export function ThinkPlaces(props: { think: ThinkInfo; me?: string }): JSX.Element | null;
  ```
- uk-ключі:
  ```ts
  thinkPrompt: 'Напишіть одне слово — але не те, що загадав ведучий',
  thinkInputLabel: 'Ваше слово',
  thinkSend: 'Надіслати',
  thinkSent: 'Ваше слово: «{word}»',
  thinkHeartsLabel: 'Життя: {count}',
  thinkSafe: 'Ви в безпеці',
  thinkHit: 'Збіг: −1 ❤️',
  thinkEmpty: 'Без відповіді: −1 ❤️',
  thinkOutNow: 'Ви вибули — тепер ви глядач',
  thinkSpectator: 'Ви глядач',
  thinkSpectatorAuthor: 'Ви автор вікторини — у цьому раунді ви глядач',
  thinkOf: 'Питання {index} з {total}',
  thinkHostWords: 'Ваші слова',
  thinkHostSave: 'Зберегти слова',
  thinkHostLocked: 'Слова зафіксовано',
  thinkHostLate: 'Таймер скінчився — впишіть слово, щоб показати результат',
  thinkHostHit: 'збіг',
  thinkHostSafe: 'в безпеці',
  thinkHostNoAnswer: '—',
  thinkHostMarkHit: 'Зарахувати збіг',
  thinkHostMarkSafe: 'Зняти збіг',
  thinkWordsTitle: 'Слова ведучого',
  thinkPlacesTitle: 'Місця раунду «Думай інакше»',
  thinkOutAt: 'вибув на {index}',
  thinkPlace: '{place} місце',
  ```
- Поведінка:
  - **Телефон:**
    - `busy`-ref — один запит за раз;
    - помилка — `errorText` (`role="status"`);
    - поле не скидається від нових зрізів, поки людина пише;
    - тексти — `dir="auto"`;
    - 320 px без горизонтальної прокрутки, довге слово переноситься (`overflow-wrap: anywhere`);
    - автор автопілота бачить `thinkSpectatorAuthor`, вибулий — `thinkOutNow` / `thinkSpectator`, без поля.
  - **Сцена:** до `reveal` жодного тексту відповідей і слів — лише ❤️ і ✓.
  - **Пульт:**
    - ручна оцінка — лише на `reveal`;
    - рядок без відповіді — без кнопок;
    - автопілот пульту не має.

- [ ] **Step 1: Write the failing tests** (`ThinkView.test.tsx`, `send` — `vi.fn`):
  - `the phone sends one word once` — ввести «Зелений» → «Надіслати» двічі → один `send('player:answer', { type: 'think', value: 'Зелений' })`; далі «Ваше слово: «Зелений»».
  - `a refusal shows the reason` — `{ ok: false, error: 'think_out' }` → «У вас не лишилося життів — ви глядач.».
  - `the spectator and the eliminated get no field` — `status: 'spectator'` → `thinkSpectator`, поля немає; `'out'` → так само.
  - `the phone verdict on reveal` — `safe` → «Ви в безпеці»; `hit` → «Збіг: −1 ❤️»; `hit` з `lives: 0` → ще й `thinkOutNow`.
  - `hearts show lives out of the start` — `lives: 1, max: 3` → 1 повне й 2 згаслі серця, `aria-label` «Життя: 1».
  - `the host saves words and is locked after the timer` — два рядки («червоний», синоніми «багряний, алий») → «Зберегти слова» → `send('host:think-words', { words: [{ word: 'червоний', synonyms: ['багряний', 'алий'] }, …] })`; `editable: false` → поля `disabled`, `thinkHostLocked`; `locked` і порожньо → `thinkHostLate`, поля активні.
  - `the host marks a match on reveal` — «Зняти збіг» біля Олени → `send('host:override', { playerId: 'p1', grade: 'correct' })`; на `question` кнопок немає.
  - `the stage hides answers before reveal` — `ThinkStage` з рядками: ✓ біля Олени, тексту «Зелений» немає.
  - `reveal shows the words and every answer` — «червоний» великим, «багряний» дрібно, «Червона» з класом `is-hit`, порожня — «—».
  - `places table` — «1 місце», «Хосе», «+10 000» (як форматує `signed()`), «вибув на 2».
  - `PlayerScreen.test.tsx`: на `question` раунду `think` — `ThinkInput`, а не `AnswerInput`.
  - `StageScreen.test.tsx`, `the think round — hearts row, reveal and places`.
  - `HostScreen.test.tsx`, `«Показати» waits for a host word` — `locked`, `canReveal: false` → кнопка `disabled`; `true` → активна, `host:next`.
  - `TeamWatch.test.tsx`, `a teammate sees the captain's word read-only`.

- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 src/screens/ThinkView.test.tsx src/screens/PlayerScreen.test.tsx src/screens/StageScreen.test.tsx src/screens/HostScreen.test.tsx src/screens/TeamWatch.test.tsx src/i18n.test.ts src/locales`. Очікується FAIL.

- [ ] **Step 3: Implement** за зразком `TruthView.tsx` (структура) і `SurvivalBoard.tsx` (ряд учасників зі станом). Числа — `signed()`, `dir="ltr"`. Нові кольори — через змінні теми, без жорстких `#fff`/`#000`, щоб світла тема (`:root.is-light`) читалась.

- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2`, `src/source-scan.test.ts` і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 35 think on the phone, stage and host console — one word, hearts, host words while the timer runs, live matches, manual match on reveal, words and answers revealed, places table"
```

---

### Задача 9. Сід «Думай інакше»

**Files:**
- Create: `apps/server/scripts/think-quiz.ts`, `apps/server/scripts/think-quiz.test.ts`
- Modify: `apps/server/scripts/seed-demo.ts` (новий ключ `think` у списку й довідці запуску)

**Interfaces:**
- Consumes: `thinkRoundSchema`, `thinkWordsIssue`, `quizSchema`, `autopilotCheck`.
- Produces: `export function thinkQuiz(): Quiz` — «Думай інакше: вечір очевидних слів». Один раунд `think`:
  - `lives: 3`, `points: 5000`, таймер кожного питання 30 с;
  - 14 питань, у кожного 3 слова. Вікторина запускається й автопілотом.

  Питання й слова (синоніми — у дужках):
  1. Напишіть колір веселки — червоний; зелений; синій (блакитний).
  2. Напишіть фрукт — яблуко; банан; груша.
  3. Напишіть тварину з зоопарку — лев; слон; жираф.
  4. Напишіть овоч для борщу — буряк; капуста; морква.
  5. Напишіть музичний інструмент — гітара; піаніно (фортепіано); скрипка.
  6. Напишіть українське місто — Київ; Львів; Одеса.
  7. Напишіть вид спорту — футбол; теніс; плавання.
  8. Напишіть, що лежить у шкільному портфелі — зошит; ручка; підручник.
  9. Напишіть птаха — горобець; голуб; лелека.
  10. Напишіть країну Європи — Франція; Італія; Німеччина.
  11. Напишіть квітку — троянда; ромашка; тюльпан.
  12. Напишіть солодощі — шоколад; цукерка; торт.
  13. Напишіть професію — лікар; учитель (вчитель); пожежник.
  14. Напишіть місяць року — січень; травень; грудень.

- [ ] **Step 1: Write the failing tests** (`think-quiz.test.ts`, за зразком `evening-quiz.test.ts`):
  - `passes the quiz schema and starts the autopilot` — `quizSchema.safeParse` без помилок; `autopilotCheck(quiz).blocked` дорівнює `[]`;
  - `every question asks for one word with three host words` — 14 питань, кожне `words.length === 3`, `thinkWordsIssue === null`;
  - `timers are at least 25 seconds`;
  - `no repeated prompts and no shared stems across questions` — тексти й `thinkStem` усіх слів різні;
  - `nothing about russia` — список `BANNED` з `evening-quiz.test.ts` (скопіювати) не трапляється в жодному тексті.

- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 scripts/think-quiz.test.ts`. Очікується FAIL.

- [ ] **Step 3: Implement** `thinkQuiz()` і ключ у `seed-demo.ts`. Решту сід-скриптів не змінювати.

- [ ] **Step 4: Run** тест із кроку 2 і `tsc -p apps/server`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/scripts/think-quiz.ts apps/server/scripts/think-quiz.test.ts apps/server/scripts/seed-demo.ts
git commit -m "feat(seed): «Думай інакше» demo — 14 one-word prompts with three host words each, autopilot-ready (seed think)"
```

---

### Задача 10. Наскрізні сценарії й кадри

**Files:**
- Create: `apps/server/e2e/part35-think.e2e.ts` (шапка, `useE2eServer()`, `try/catch` → `snapshot()`, як у `part28a-c-moreless-truth-drawing.e2e.ts`)
- Modify: `apps/server/e2e/helpers/common.ts` — свої помічники з суфіксом `35`: `writeWord35(page, word)`, `hostWords35(host, words)`, `hearts35(page): Promise<number>`

**Interfaces:**
- Consumes: усе вище. Помічники e2e: `open`, `register`, `field`, `click`, `questionText`, `openRoundSettings`, `shot`, `expectNoSideScroll`, `snapshot`, `POLL`, `exact`, `pilotPlayer`, `emitOk`, `socketFrames`, `stateViews`.

- [ ] **Step 1: Write the scenarios** (`leaderboard: 'end'`; таймери 25–30 с; ведучий закриває рано через «Закрити», де чекати таймер не треба).
  - **`it('part 35: think different — host words prepared, added during the question and after the timer, soft matching with endings, a manual match, an empty answer, elimination, early end, places and points, 320 px, light theme', …, 600_000)`.**
    - **Редактор.** Ведучий створює раунд «Думай інакше»: життя 2, бали 3000, 5 питань:
      - `Напишіть колір веселки` — заготовлені «червоний», «фіолетовий»;
      - `Напишіть фрукт` — без слів (видно `thinkNoWordsNote`);
      - `Напишіть тварину з зоопарку` — без слів;
      - `Напишіть птаха` — «горобець»;
      - `Напишіть квітку` — «троянда» (до нього гра не дійде: дострокове закінчення).
      - Кадр `think35-editor`.
    - **Гра.** Сцена 1600×900. Оля — 375×812, Тарас — 360×740, Хосе — 320×640 `es-ES`.
    - **Питання 1:**
      - Оля пише «Фіолетова», Тарас — «зелений», Хосе мовчить;
      - до розкриття `stage.content()` і всі телефони не містять «червоний», «фіолетовий», «Фіолетова», «зелений»;
      - сцена показує ✓ біля Олі й Тараса;
      - ведучий бачить у «Ваші слова» обидва слова й «збіг» біля Олі (закінчення);
      - таймер → «Показати» → розкриття: «фіолетовий» великим, Оля підсвічена, ❤️ гасне; Хосе «—» (порожня, −1);
      - телефон Тараса «Ви в безпеці», Олі «Збіг: −1 ❤️».
      - Кадри `think35-stage-question`, `think35-phone-input-es-320`, `think35-host-words`, `think35-stage-reveal`, `think35-phone-verdict`.
    - **Питання 2 (без слів, ведучий вписує під час таймера):** ведучий вписує «яблуко» з синонімом «яблучко» → «Зберегти слова»; Тарас пише «Яблука» (збіг), Оля — «груша», Хосе — «манго». Розкриття: Тарас −1.
    - **Ручна оцінка:** на розкритті питання 2 ведучий «Зняти збіг» біля Тараса → Тарас знову «в безпеці», ❤️ повертається.
    - **Питання 3 (без слів до кінця таймера):**
      - «Показати» неактивна з підказкою;
      - ведучий вписує «лев» після таймера → кнопка активна;
      - Оля пише «Левиця» (`левиц` проти `лев` — **не** збіг, перевірити саме це), Тарас — «жираф»;
      - Хосе — «лев» → вибуває (0 ❤️) → телефон Хосе «Ви вибули — тепер ви глядач», поля на питанні 4 немає.
    - **Питання 4:**
      - Оля пише «горобці» (збіг через закінчення й одну описку, остання ❤️ → 0), Тарас — «лелека»;
      - на розкритті — **світла тема**: на сцені й телефоні Олі `page.evaluate(() => localStorage.setItem('quiz:theme', 'light'))` + перезавантаження (гра повертається за токеном). Кадри `think35-light-stage-reveal`, `think35-light-phone-verdict`;
      - «Далі» → живим лишився один (Тарас) → раунд закінчується, питання «квітка» не з'являється.
      - Таблиця місць: Тарас 1 (+3000), Оля 2 (+1500, вибула на 4), Хосе 3 (0, вибув на 3) — числа за формулою.
      - Кадри `think35-stage-places`, `think35-light-stage-places`.
    - **Перевірки:**
      - рахунки після раунду відповідають місцям;
      - `expectNoSideScroll` для поля, вердикту й таблиці на 320 px (`es`) і 360 px;
      - історія гри — «Слова ведучого: яблуко, …» і вердикти.
  - **`it('part 35: think different solo and in teams — the solo player walks the whole round, captains write for teams, team lives and places', …, 600_000)`:**
    - **Соло:** один гравець, життя 1, 3 питання, жодного збігу → проходить усі 3 (раунд **не** закінчується після першого), отримує P. Кадр `think35-solo-places`.
    - **Команди:** дві команди по двоє:
      - капітан А пише, некапітан А бачить слово лише для читання;
      - на сцені ряд — команди з ❤️;
      - місця й очки — командні.
      - Кадри `think35-team-captain`, `think35-team-watch`.
  - **`it('part 35: think different on autopilot — a wordless question blocks the launch, prepared words play by themselves, the author watches', …, 600_000)`:**
    - вікторина з питанням без слів → вікно запуску автопілота показує `autopilotBlock_think_words` з номером раунду, «Створити» неактивна;
    - вікторина з усіма словами → запуск;
    - автор (на телефоні) бачить `thinkSpectatorAuthor`, поля немає;
    - двоє `pilotPlayer` пишуть слова через `emitOk('player:answer', { type: 'think', value })`;
    - розкриття й наступні питання — самі;
    - у кадрах `state` гравців (`stateViews(socketFrames)`) до розкриття немає слів;
    - гра доходить до таблиці місць без автора.
    - Кадри `think35-autopilot-blocked`, `think35-autopilot-author`.
  - **Кадри (`E2E_SHOTS=1`)** — усі названі вище.

- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 35"` (менше 10 хв). Очікується PASS.

- [ ] **Step 3: Переглянути кадри** (`apps/server/e2e/artifacts/shots/think35-*.png`):
  - поле, вердикт і таблиця на 320/360 px не вилазять;
  - довгі ніки й слова переносяться;
  - слова на сцені читаються на 1600×900;
  - іспанська й світла теми цілі: контраст сердець і підсвітки збігу.
  Якщо щось ламається — виправити CSS, коміт окремо.

- [ ] **Step 4: Run** `pnpm test --maxWorkers=2` (усе) і `pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/part35-think.e2e.ts apps/server/e2e/helpers/common.ts apps/web/src/styles.css
git commit -m "test(e2e): part 35 think different — prepared, live and late host words, soft matching, manual match, elimination, early end, places, solo, teams, autopilot block and the watching author, 320 px and light theme"
```
