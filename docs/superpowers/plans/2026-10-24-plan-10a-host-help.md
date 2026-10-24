# План 10a: довідка ведучого — «ⓘ» у редакторі й на пульті, сторінка-довідник

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 10a специфікації (розділ 5). Ведучий має зрозуміти кожен формат, не читаючи нічого, крім «ⓘ».
- **«ⓘ» у редакторі** стоїть біля вибору типу раунду, типу запитання, видів клітинок поля (звичайна, бліц, «вголос», ×2/×3), кожного бафу й дебафу та важливих налаштувань (рейтинг, пояснення для новачків, бали за швидкість, запасні запитання, крамниця дебафів і ціни, дуелі, правила раунду: штраф «мінус», «частково», серії, множник).
- **Вікно довідки:** розділи «Що це», «Як іде в грі», «Бали», «Порада» і, за потреби, «Обмеження». На широкому екрані це невелике вікно в правому нижньому куті, на телефоні — аркуш знизу. Вікно немодальне: під ним можна далі працювати з редактором і пультом, гру воно не зупиняє.
- **Довідник** `/help`: усі пояснення, згруповані за темами (раунди, типи запитань, клітинки поля, бафи, дебафи, налаштування; «Команди» з'являться в 10j), пошук за назвою, якорі `#help-…`. Посилання «Довідка ведучого» є в редакторі, у списку вікторин і на пульті.
- **На пульті** «ⓘ» стоїть біля назви поточного раунду, типу поточного запитання й виду клітинки поля.
- **Одне джерело текстів:** тексти довідки лежать у `apps/web/src/help/` і живлять і «ⓘ», і довідник. Пояснення для гравців (`guide-text.ts`, «?» біля бафів) не змінюються; тести звіряють числа й назви між двома наборами.
- **Нові формати 10b–10j** додають свої записи без змін у компонентах: тести вимагають запис для кожного типу раунду, типу запитання, виду клітинки, бафу, дебафу й налаштування з переліку.

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`).** Нові переліки `ROUND_TYPES` і `QUESTION_TYPES` (із типами `RoundType`, `QuestionType`) як єдине джерело списків. Тест звіряє їх із дискримінаторами `roundSchema` і `questionSchema`: нова схема без запису в переліку валить тест. `apps/web/src/editor/draft.ts` реекспортує `QUESTION_TYPES`/`QuestionType` із shared замість власної копії.
- **Вміст (`apps/web/src/help/`).**
  - `types.ts`: `HelpEntry`.
  - `rounds.ts`, `questions.ts`, `cells.ts`, `powers.ts`, `settings.ts`: записи як `Record<ключ, HelpEntry>`. Новий ключ у переліку shared без запису ламає `pnpm typecheck`.
  - `host-help.ts`: таблиця тем `TOPICS`, тип `HelpId` (виводиться з таблиці), функції `helpIds`, `helpEntry`, `helpTopic`, `helpAnchor`, `searchHelp`, `cellHelpId`.
  - Тексти довідки живуть тут, а не в `i18n.ts`: це структурований вміст на сотні рядків. У `i18n.ts` ідуть лише підписи інтерфейсу довідки: заголовки розділів, кнопки, назви тем, пошук.
- **Компоненти (`apps/web/src/help/HelpButton.tsx`).** `HelpButton` — кнопка «ⓘ» з `aria-label` «Довідка: {назва}» і немодальним вікном через портал. `HelpBody` — розділи запису, спільні для вікна й довідника. Посилання «Усі пояснення» веде на `/help#якір` у новій вкладці (звичайний `<a>`, без роутера, бо пульт і редактор тестуються без нього).
- **Сторінка (`apps/web/src/pages/HostHelp.tsx`).** Маршрут `/help` усередині `WithMenu`, без входу в акаунт.
- **Редактор.** «ⓘ» розставляються в `RoundStrip`, `RoundSettings`, `QuestionEditor`, `BoardEditor`, `PowersEditor` і `QuizEditor` (розділи «Правила гри», «Запасні запитання», «Дуелі»). Посилання «Довідка ведучого» відкривається в новій вкладці, щоб не втратити незбережені зміни. Натиск «ⓘ» не змінює вікторину: вона не стає «зміненою».
- **Пульт (`HostScreen.tsx`).** Рядок контексту `.host-context`: «{раунд} ⓘ · {тип запитання} ⓘ [· {клітинка} ⓘ]». Ще одна «ⓘ» стоїть біля назви раунду на заставці, а в `nav.links` є посилання на довідник. Пульт нічого не надсилає на сервер, коли відкриває вікно.
- **Рушій і сервер не змінюються.** Форма `GameState` та сама, тож `GAME_STATE_VERSION` не піднімається, і пуш 10a ігор, що йдуть, не перериває. Сервер отримує лише новий наскрізний сценарій.

**Технології:** TypeScript, zod 4, React 19 + react-router 7, vitest + Testing Library (jsdom), Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-new-formats-design.md`, розділ 5 (частина 10a); розділ 2 («ведучому треба читати зовнішню документацію» — анти-ціль); розділ 4 (кожна наступна частина додає свої тексти). Зразки:
- `apps/web/src/screens/Buffs.tsx` (`BuffHelp`: портал, Escape, повернення фокуса);
- `apps/web/src/guide-text.ts` (`ROUND_ICONS`, `TYPE_ICONS`, `ROUND_NAMES`);
- `apps/web/src/buff-meta.ts`, `apps/web/src/debuff-meta.ts`;
- `apps/web/src/editor/{QuizEditor,RoundStrip,RoundSettings,QuestionEditor,BoardEditor,PowersEditor}.tsx`;
- `apps/web/src/screens/HostScreen.tsx` і `HostScreen.test.tsx` (фабрика `view()`);
- `apps/web/src/AppRoutes.tsx`, `AppRoutes.test.tsx`;
- `apps/web/src/pages/Quizzes.tsx`;
- `apps/server/e2e/full-game.e2e.ts` (помічники `open`, `register`, `join`, `click`, `shot`, `expectNoSideScroll`, `afterSplash`, `seconds`, `exact`; сценарій 9d `categorySparesGame` як зразок структури).

**Рішення плану там, де специфікація мовчить:**
- **Де «ⓘ» у редакторі.**
  - **Тип раунду:** після кожної з чотирьох кнопок вибору в «+ Раунд» і першим рядком «Налаштувань раунду» (довідка про тип раунду, який зараз редагується).
  - **Тип запитання:** одна «ⓘ» після рядка чипів типів. Вона показує довідку саме вибраного типу, бо «ⓘ» біля кожного з дев'яти чипів перевантажила б рядок на телефоні.
  - **Клітинки:**
    - біля «Позначки» — довідка ×2/×3;
    - біля «Типу клітинки» — довідка поточного значення (звичайна або бліц);
    - біля «Як відповідати» — довідка «вголос»;
    - біля «Штрафу бліцу» — довідка бліц-клітинки.
  - **Бафи й дебафи:** «ⓘ» у кожному рядку, а біля прапорця «Гравці можуть купувати дебафи» — довідка крамниці.
  - **Налаштування:** «Показувати рейтинг», «Пояснення для новачків», «Бали за швидкість», штраф, «частково», серії й множник. Для «Запасних запитань» «ⓘ» стоїть першим рядком розділу і в заголовку «Запасні категорії «…»» поля; для «Дуелей» — першим рядком розділу.
  - **Розміщення:** «ⓘ» стоїть поруч із `<label>` (обгортка `.with-help`), а не всередині нього і не в `<summary>`. Так натиск не перемикає прапорець і не згортає розділ.
- **«Дуель» серед клітинок.** У специфікації «дуель» стоїть у переліку видів клітинок, але в коді дуель — налаштування вікторини, а не клітинка. Тому довідка дуелей — запис `setting.duels` у темі «Налаштування».
- **Клітинки в довіднику:** чотири записи: `cell.normal`, `cell.blitz` (зі штрафом «Мінус для всіх»), `cell.voice`, `cell.marks` (×2 і ×3 разом).
- **Вікно немодальне.** Немає затемнення й пастки фокуса. Вікно закривається кнопкою «Закрити», клавішею Escape (фокус повертається на «ⓘ») або натиском поза ним. Натиск поза вікном проходить далі, тож ведучий одним дотиком закриває вікно й натискає «Далі». Одночасно відкрите лише одне вікно: відкриття нового закриває попереднє.
- **Пошук у довіднику** — за назвою запису, без урахування регістру й виду апострофа. Порожній пошук показує все; без збігів показується «Нічого не знайдено.». Тема без записів не показується, тож «Команди» сховані до 10j.
- **Порядок записів у темі** — порядок переліків: `ROUND_TYPES`, `QUESTION_TYPES`, `CELL_HELP_KEYS`, `BUFF_KINDS`, `DEBUFF_KINDS`, `SETTING_HELP_KEYS`.
- **Назви записів** збігаються з назвами в інтерфейсі (`roundType*`, `type_*`, `buff_*`, `debuff_*`), і тест це закріплює. Тож «Довідка: Щит» — це той самий «Щит», що в редакторі й на телефоні.
- **Числа в текстах** беруться з `LIMITS` і `DEFAULT_ANSWER_WINDOW` через шаблонні рядки: ціни дебафів, ліміти запасних, вікно бліц-клітинки. Числа рушія, яких веб не бачить (30 с «Додаткового часу», 15 с залу, 20 с заміни, 5 с заморозки, 4 с дзеркала), тести звіряють із текстами гравців і константами вебу (`MIRROR_SWAP_MS`, `freezeMs`).
- **Посилання на довідник** з редактора й пульта відкриваються в новій вкладці (`target="_blank"`), а зі списку вікторин — у тій самій.
- **Чого не робимо:** не змінюємо правил ігор, рушія й тексти для гравців; не робимо «ⓘ» на сцені й телефонах гравців; не робимо довідку для кожного варіанта `select` окремо.

**Як додати запис у наступних частинах (10b–10j)** — для будівельника наступних планів:
1. Нове значення в переліку shared (`ROUND_TYPES`, `QUESTION_TYPES`, `CELL_KINDS`, `BUFF_KINDS`, `DEBUFF_KINDS`) або нове налаштування в `SETTING_HELP_KEYS` спричиняє помилку `pnpm typecheck` у відповідному `Record<…, HelpEntry>`.
2. Треба додати запис у відповідний файл `apps/web/src/help/*.ts`. Він сам з'явиться в «ⓘ», у довіднику й у пошуку.
3. Нова тема (наприклад `teams` у 10j) — це рядок у `TOPICS` (`host-help.ts`) і файл записів. Назва теми в `i18n.ts` (`helpTopic_teams`) уже є.

## Глобальні обмеження

- Рушій, сервер (крім e2e) і схема вікторини не змінюються: `GAME_STATE_VERSION` лишається, жодної міграції.
- Тексти довідки — лише в `apps/web/src/help/*.ts`. Підписи інтерфейсу довідки — лише в `apps/web/src/i18n.ts`.
- Тексти гравців (`guide-text.ts`, `buffGuide_*`, `buffWhere_*`, `debuffGuide_*`, `summary*`) не змінюються. Розбіжність, знайдену під час роботи, виправляють у довідці, а не в текстах гравців.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2`. Якщо PGlite падає з браком пам'яті, запускати окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри знімаються з `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` і лягають в `apps/server/e2e/artifacts/shots`.
- Вузький екран 375 px — без горизонтальної прокрутки, як і решта застосунку.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `packages/shared/src/quiz.test.ts` | `ROUND_TYPES`, `QUESTION_TYPES`, `RoundType`, `QuestionType`; звірка зі схемами | 1 |
| `apps/web/src/editor/draft.ts` | реекспорт `QUESTION_TYPES`/`QuestionType` із shared | 1 |
| `apps/web/src/guide-text.ts` | експорт `ROUND_ICONS`, `TYPE_ICONS`, `ROUND_NAMES` | 1 |
| `apps/web/src/help/types.ts`, `rounds.ts`, `questions.ts`, `cells.ts`, `host-help.ts`, `host-help.test.ts` (нові) | каркас і тексти раундів, типів запитань, клітинок | 1 |
| `apps/web/src/help/powers.ts`, `settings.ts` (нові), `host-help.ts`, `host-help.test.ts` | тексти бафів, дебафів, налаштувань; звірка з текстами гравців | 2 |
| `apps/web/src/help/HelpButton.tsx`, `HelpButton.test.tsx` (нові), `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | «ⓘ», немодальне вікно / аркуш, `HelpBody` | 3 |
| `apps/web/src/pages/HostHelp.tsx`, `HostHelp.test.tsx` (нові), `apps/web/src/AppRoutes.tsx`, `AppRoutes.test.tsx`, `apps/web/src/pages/Quizzes.tsx`, `Quizzes.test.tsx`, `apps/web/src/styles.css` | довідник `/help`, посилання зі списку вікторин | 4 |
| `apps/web/src/editor/{QuizEditor,RoundStrip,RoundSettings,QuestionEditor,BoardEditor,PowersEditor}.tsx`, `QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `PowersEditor.test.tsx`, `apps/web/src/styles.css` | «ⓘ» у редакторі, посилання на довідник | 5 |
| `apps/web/src/screens/HostScreen.tsx`, `HostScreen.test.tsx`, `apps/web/src/styles.css` | рядок контексту з «ⓘ» на пульті, посилання на довідник | 6 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 10a з кадрами | 7 |

## Порядок збирання

- Задача 1 — перша; задача 2 спирається на 1.
- Задача 3 спирається на 2 (тести беруть записи бафів і налаштувань).
- Задача 4 спирається на 2 і 3. Задача 5 спирається на 2 і 3. Задача 6 спирається на 3 (і на 1 для `cellHelpId`).
- Отже, порядок: 1 → 2 → 3 → (4, 5, 6 у будь-якому порядку) → 7.
- Задача 7 — остання.
- Навмисні зміни наявних тестів: лише ті, що шукають кнопки за точною кількістю. Якщо `QuizEditor.test.tsx`, `PowersEditor.test.tsx` чи `HostScreen.test.tsx` рахують усі `button` або перевіряють `getAllByRole('button')`, нові «ⓘ» додають кнопок. Такі тести звузити до потрібної кнопки за назвою, а не міняти очікування числа.

## На що дивитися рецензентові

1. **Повнота.** Кожен тип раунду, тип запитання, вид клітинки, баф, дебаф і налаштування з переліку має запис, і typecheck цього вимагає. Тести: задача 1 `every round type, question type and cell kind has an entry`, задача 2 `every buff, debuff and listed setting has an entry`.
2. **Точність текстів.** Тексти описують поведінку рушія, а не бажану поведінку. Звірити з кодом:
   - `packages/engine/src/score.ts` — швидкість від 100 до 50 %, числа, штраф лише за дану відповідь;
   - `board-cells.ts` — свій правильний на бліц-клітинці ×2, неправильна спроба там коштує 0, «Мінус для всіх»;
   - `game.ts`: `unansweredIsWrong` (мовчання на звичайній клітинці поля — помилка) і `acceptAnswer` (часткові на полі лише з «частково»);
   - `buffs.ts` (`fiftyCount`, `applyBuff`, `takeSpare`, `canVote`) і `debuffs.ts` (`shopBlock`, `answerersOf`).
3. **Немає протиріч із текстами гравців.** Тест задачі 2 `host help agrees with the player texts` перевіряє назви й числа.
4. **Вікно не заважає грі.** Пульт нічого не надсилає, головна кнопка натискається з відкритим вікном, таймер іде. Тести: задача 6 і e2e задачі 7.
5. **Редактор не стає «зміненим»** від натиску «ⓘ». Тести: задача 5 і e2e (вихід через «Скасувати» без питання).
6. **Телефон.** Аркуш знизу на 375 px без горизонтальної прокрутки — кадри e2e задачі 7.

---

### Задача 1. Переліки типів у shared і каркас довідки з текстами раундів, запитань і клітинок

**Files:**
- Modify: `packages/shared/src/quiz.ts` (переліки поруч із `SIMPLE_TYPES`)
- Modify: `packages/shared/src/quiz.test.ts`
- Modify: `apps/web/src/editor/draft.ts` (реекспорт замість власного `QUESTION_TYPES`)
- Modify: `apps/web/src/guide-text.ts` (експорт `ROUND_ICONS`, `TYPE_ICONS`, `ROUND_NAMES`)
- Create: `apps/web/src/help/types.ts`, `apps/web/src/help/rounds.ts`, `apps/web/src/help/questions.ts`, `apps/web/src/help/cells.ts`, `apps/web/src/help/host-help.ts`
- Create: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- Produces (`packages/shared/src/quiz.ts`):
  ```ts
  /** Типи раундів у порядку редактора; звіряється з roundSchema у тесті. */
  export const ROUND_TYPES = ['classic', 'blitz', 'board', 'final'] as const;
  export type RoundType = (typeof ROUND_TYPES)[number];
  /** Типи запитань у порядку редактора; звіряється з questionSchema у тесті. */
  export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order', 'match', 'chain', 'sort'] as const;
  export type QuestionType = (typeof QUESTION_TYPES)[number];
  ```
  Оголосити до `questionSchema` (`QUESTION_TYPES`) і до `roundSchema` (`ROUND_TYPES`). Схеми не змінюються.
- `apps/web/src/editor/draft.ts`: прибрати локальні `QuestionType` і `QUESTION_TYPES`, додати `import { QUESTION_TYPES, type QuestionType } from '@quiz/shared'` і `export { QUESTION_TYPES, type QuestionType } from '@quiz/shared';`. Імпорти в `QuestionEditor.tsx`, `draft-storage.ts` і `draft.test.ts` лишаються робочими.
- `apps/web/src/guide-text.ts`: `export const ROUND_ICONS`, `export const TYPE_ICONS`, `export const ROUND_NAMES` (значення ті самі).
- Produces (`apps/web/src/help/types.ts`):
  ```ts
  /** Один запис довідки ведучого: розділи вікна «ⓘ» і довідника. */
  export interface HelpEntry {
    /** Назва, як в інтерфейсі («Щит», «Ігрове поле»). */
    title: string;
    /** «Що це» — одне-два речення. */
    what: string;
    /** «Як іде в грі» — кроки, як їх бачать гравці, сцена й ведучий. */
    how: string[];
    /** «Бали» — як рахуються. */
    points: string[];
    /** «Порада» — коли брати, типові помилки. */
    tip: string[];
    /** «Обмеження» — де не діє; немає — розділу немає. */
    limits?: string[];
  }
  ```
- Produces (`apps/web/src/help/cells.ts`): `export const CELL_HELP_KEYS = [...CELL_KINDS, 'voice', 'marks'] as const; export type CellHelpKey = (typeof CELL_HELP_KEYS)[number]; export const CELL_HELP: Record<CellHelpKey, HelpEntry>`.
- Produces (`apps/web/src/help/rounds.ts`): `export const ROUND_HELP: Record<RoundType, HelpEntry>`. (`questions.ts`): `export const QUESTION_HELP: Record<QuestionType, HelpEntry>`.
- Produces (`apps/web/src/help/host-help.ts`):
  ```ts
  import { ROUND_TYPES, QUESTION_TYPES, type AnswerMode, type CellKind, type CellMark } from '@quiz/shared';
  import { CELL_HELP, CELL_HELP_KEYS } from './cells';
  import { QUESTION_HELP } from './questions';
  import { ROUND_HELP } from './rounds';
  import type { HelpEntry } from './types';

  /** Теми довідника в порядку сторінки; teams — з частини 10j. */
  export const HELP_TOPICS = ['rounds', 'questions', 'cells', 'buffs', 'debuffs', 'settings', 'teams'] as const;
  export type HelpTopic = (typeof HELP_TOPICS)[number];

  interface Topic<P extends string, K extends string> {
    prefix: P;
    keys: readonly K[];
    entries: Record<K, HelpEntry>;
  }
  const topic = <P extends string, K extends string>(prefix: P, keys: readonly K[], entries: Record<K, HelpEntry>): Topic<P, K> => ({ prefix, keys, entries });
  const none = <P extends string>(prefix: P): Topic<P, never> => ({ prefix, keys: [], entries: {} as Record<never, HelpEntry> });

  /** Таблиця тем: новий тип у переліку shared без запису не пройде typecheck. */
  const TOPICS = {
    rounds: topic('round', ROUND_TYPES, ROUND_HELP),
    questions: topic('question', QUESTION_TYPES, QUESTION_HELP),
    cells: topic('cell', CELL_HELP_KEYS, CELL_HELP),
    buffs: none('buff'), // задача 2
    debuffs: none('debuff'), // задача 2
    settings: none('setting'), // задача 2
    teams: none('team'), // частина 10j
  } satisfies Record<HelpTopic, Topic<string, string>>;

  type Topics = typeof TOPICS;
  /** Ідентифікатор запису: 'round.board', 'buff.swap', 'setting.spares'… */
  export type HelpId = { [T in HelpTopic]: `${Topics[T]['prefix']}.${Topics[T]['keys'][number]}` }[HelpTopic];

  /** Записи теми в порядку переліку. */
  export function helpIds(topic: HelpTopic): HelpId[];
  /** Тема запису за префіксом id. */
  export function helpTopic(id: HelpId): HelpTopic;
  export function helpEntry(id: HelpId): HelpEntry;
  /** Якір запису в довіднику: 'buff.swap' → 'help-buff-swap'. */
  export function helpAnchor(id: HelpId): string;
  /** Усі записи в порядку тем; query — за назвою, без регістру й виду апострофа; '' — усе. */
  export function searchHelp(query: string): HelpId[];
  /** Запис для клітинки поля: бліц → cell.blitz; усна → cell.voice; ×2/×3 → cell.marks; інакше cell.normal. */
  export function cellHelpId(cell: { kind: CellKind; answerMode: AnswerMode; mark: CellMark }): HelpId;
  ```
  Нормалізація для пошуку: `s.trim().toLocaleLowerCase('uk').replace(/[’ʼ`]/g, "'")`. `helpEntry` бере `TOPICS[helpTopic(id)].entries[ключ]`; невідомий id — помилка (`throw`), але з типом `HelpId` такого не буває.

- **Тексти** (переносити дослівно; `{…}` у тексті немає):

  **`rounds.ts`**
  ```ts
  export const ROUND_HELP: Record<RoundType, HelpEntry> = {
    classic: {
      title: 'Класичний',
      what: 'Звичайні запитання по черзі: усі гравці відповідають одночасно, кожен у своєму телефоні.',
      how: [
        'Ви натискаєте «Почати раунд» — запитання з’являється на сцені й у телефонах, іде таймер.',
        'Запитання закривається, коли відповіли всі, сплив час або ви натиснули «Закрити запитання».',
        '«Показати відповідь»: сцена показує правильну відповідь, телефони — результат і бали. Тут можна вручну зарахувати чи відхилити відповідь гравця.',
        'Якщо рейтинг показується після кожного запитання, далі йде таблиця, потім — наступне запитання.',
      ],
      points: [
        'Кожен, хто відповів правильно, отримує ціну запитання.',
        'З бонусом за швидкість миттєва відповідь дає повну ціну, а відповідь в останню секунду — половину.',
        'Впорядкування й число з відхиленням дають частину ціни за майже правильну відповідь.',
        'Штраф «мінус», «частково», серії й множник задаються в налаштуваннях раунду (див. їхні «ⓘ»).',
        'За рівних балів вище той, хто в класичних раундах відповідав швидше.',
      ],
      tip: [
        'Тематичний раунд — це звичайний класичний раунд, де всі запитання однієї теми чи виду, наприклад лише картинки.',
        'Для розминки вимкніть штраф і дайте 20–30 секунд на запитання.',
      ],
    },
    blitz: {
      title: 'Бліц',
      what: 'Запитання для найшвидших: бали отримує лише той, хто першим відповість правильно.',
      how: [
        'Перевірка «Ведучий»: гравці натискають «Відповісти» в телефоні й стають у чергу. Перший у черзі відповідає (за вікно відповіді, якщо воно задане), ви оцінюєте «Правильно» чи «Неправильно». Поки ви вирішуєте, таймер стоїть.',
        'Після помилки відповідає наступний у черзі. Спроб у кожного стільки, скільки задано в налаштуваннях раунду.',
        'Перевірка «Автоматично» — миттєвий бліц: кнопки немає, кожен одразу відповідає один раз. Відповіді стають у чергу за часом, ви по черзі натискаєте «Прийняти», а правильність перевіряється сама.',
        'Запитання закривається після першої правильної відповіді, коли сплив час або коли спроби скінчилися в усіх.',
      ],
      points: [
        'Перший, хто відповів правильно, отримує ціну запитання (× множник раунду), решта — 0.',
        'Зі штрафом «мінус» кожна неправильна спроба знімає ціну запитання.',
        'Бонусу за швидкість і «частково» в бліці немає.',
        'Сортування в бліці виграє той, хто першим розклав усі слова.',
      ],
      tip: [
        'Миттєвий бліц зручний для великої компанії: не треба оцінювати кожного вручну.',
        'Ручна перевірка підходить для відповідей своїми словами.',
      ],
      limits: ['Ланцюжка слів у бліці немає.', 'Бафи в бліці не діють.'],
    },
    board: {
      title: 'Ігрове поле',
      what: 'Табло з категоріями й цінами: гравці по черзі вибирають клітинку, а відповідає той, хто вибрав.',
      how: [
        'На заставці раунду задайте чергу: «Кидати кубики» (кожен кидає в телефоні), стрілками або «За порядком приєднання».',
        'У свій хід гравець торкається клітинки в телефоні, або ви вибираєте за нього на пульті. Клітинка перегортається, і всі бачать запитання.',
        'На звичайній клітинці відповідає лише той, хто вибрав, — з телефона або вголос. Решта дивляться.',
        'Відповідь з телефона приходить вам. За автоматичної перевірки ви натискаєте «Прийняти» або «Перевибрати» (гравець відповість ще раз, час іде далі). За ручної ставите оцінку самі.',
        'Якщо гравець, чий хід, відключився, хід пропускається через 30 секунд; «Пропустити хід» — одразу.',
        'Раунд закінчується, коли зіграно всі клітинки або ви натиснули «Завершити раунд».',
      ],
      points: [
        'Правильна відповідь приносить ціну клітинки × позначку (×2/×3) × множник раунду.',
        'Зі штрафом «мінус» помилка або мовчання на звичайній клітинці знімають стільки ж.',
        'Бонусу за швидкість немає. Часткові бали (впорядкування, число з відхиленням, оцінка «Частково») — лише з правилом «частково», інакше майже правильна відповідь дає 0.',
        'Серія рахується лише за власні клітинки гравця.',
      ],
      tip: [
        'Ставте дешеві клітинки вгорі, а дорогі внизу — так гравцям легше вибирати ризик.',
        'Одна-дві приховані ×2 і одна бліц-клітинка роблять поле живим.',
        'Для «Заміни запитання» додайте кожній категорії по 1–2 запасні.',
      ],
      limits: [
        `${LIMITS.minCategories}–${LIMITS.maxCategories} категорій, у кожній ${LIMITS.minCategoryQuestions}–${LIMITS.maxCategoryQuestions} клітинок, до ${LIMITS.maxQuestions} клітинок на полі.`,
        'Ланцюжка слів на полі немає; сортування — лише на звичайній клітинці з телефона.',
      ],
    },
    final: {
      title: 'Фінал',
      what: 'Одне запитання для всіх зі ставками: кожен таємно ставить частину своїх балів.',
      how: [
        'Після заставки гравці роблять ставку в телефоні — від 0 до свого рахунку; «Ва-банк» ставить усе. Хто має 0 або менше, ставить лише 0.',
        'Запитання відкривається, коли поставили всі, або коли ви натиснете «Показати запитання».',
        'Усі відповідають одночасно. За ручної перевірки ви оцінюєте кожну відповідь: «Зарахувати» чи «Не зараховувати».',
        'На розкритті гравці відкриваються по одному («Наступний гравець»): сцена показує ставку й новий рахунок. У спільному банку останній крок — «Розділити банк».',
      ],
      points: [
        'Класичні ставки: правильна відповідь — плюс ставка, неправильна або жодної — мінус ставка.',
        'Спільний банк: хто помилився чи мовчав, віддає ставку в банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам. Якщо правильних зі ставкою немає, ставки повертаються.',
        'Ціни запитання, правил раунду, бонусу за швидкість і бафів у фіналі немає.',
      ],
      tip: [
        'Ставте фінал останнім раундом — тоді ставки мають сенс.',
        'Спільний банк рятує тих, хто відстає: обережна ставка нічого не втрачає.',
      ],
      limits: ['Рівно одне запитання.', 'Купувати дебафи у фінальному раунді не можна.'],
    },
  };
  ```
  (`LIMITS` імпортувати з `@quiz/shared`.)

  **`questions.ts`**
  ```ts
  export const QUESTION_HELP: Record<QuestionType, HelpEntry> = {
    single: {
      title: 'Один правильний варіант',
      what: 'Кілька варіантів, правильний один.',
      how: [
        'Гравець торкається варіанта — і відповідь надіслано.',
        'Варіант може бути текстом, картинкою або обома.',
        'З налаштуванням раунду «Перемішувати варіанти» варіанти йдуть у випадковому порядку.',
      ],
      points: ['Правильно — ціна запитання, неправильно — 0 (або мінус зі штрафом).'],
      tip: ['3–4 правдоподібні варіанти — найкращий вибір.', 'Найкраще пасує до бафу 50/50.'],
      limits: [`${LIMITS.minOptions}–${LIMITS.maxOptions} варіантів.`],
    },
    multi: {
      title: 'Кілька правильних варіантів',
      what: 'Треба позначити всі правильні варіанти.',
      how: ['Гравець позначає варіанти й натискає «Відповісти».'],
      points: ['Ціна — лише коли позначено всі правильні й жодного зайвого; інакше 0.'],
      tip: ['Якщо не хочете, щоб гравці гадали, скажіть у тексті, скільки правильних.'],
      limits: [`${LIMITS.minOptions}–${LIMITS.maxOptions} варіантів, щонайменше один правильний.`],
    },
    boolean: {
      title: 'Так чи ні',
      what: 'Твердження, з яким треба погодитися чи ні.',
      how: ['Гравець торкається «Так» або «Ні».'],
      points: ['Правильно — ціна запитання, інакше 0.'],
      tip: ['Вгадати можна з імовірністю 50 %, тож ставте меншу ціну або вмикайте штраф «мінус».'],
    },
    text: {
      title: 'Текстова відповідь',
      what: 'Гравець пише відповідь сам.',
      how: [
        'Гравець вводить текст і натискає «Відповісти».',
        'Відповідь порівнюється з усіма прийнятними написаннями без урахування регістру й зайвих пробілів.',
        'Правильну відповідь з іншим написанням зарахуйте вручну на розкритті.',
      ],
      points: ['Збіг з одним із написань — ціна запитання, інакше 0.'],
      tip: ['Додайте поширені написання: «Шевченко», «Т. Шевченко», «Тарас Шевченко».'],
      limits: [`До ${LIMITS.maxAccepted} написань.`],
    },
    numeric: {
      title: 'Число',
      what: 'Відповідь — число.',
      how: ['Гравець вводить число й натискає «Відповісти».'],
      points: [
        'Відхилення 0: ціну дає лише точне число.',
        'З відхиленням: точне число — повна ціна, на межі відхилення — половина, між ними — пропорційно; за межею — 0.',
        'На полі неточне число в межах відхилення дає бали лише з правилом «частково».',
      ],
      tip: ['Для дат і великих чисел задавайте відхилення, наприклад рік ± 5.'],
    },
    order: {
      title: 'Впорядкування',
      what: 'Елементи треба розставити в правильному порядку.',
      how: [
        'Гравець переставляє рядки стрілками ↑ ↓ і натискає «Відповісти».',
        'Підписи «Що зверху» і «Що знизу» (наприклад, «Найбільший») підказують напрям.',
      ],
      points: [
        'Усе на місцях — ціна запитання. Інакше — частка за кожен елемент на своєму місці (3 з 5 — 60 %).',
        'На полі частку дає лише правило «частково».',
      ],
      tip: ['Записуйте елементи в правильному порядку: гравці побачать їх перемішаними.'],
      limits: [`${LIMITS.minOrderItems}–${LIMITS.maxOrderItems} елементів.`],
    },
    match: {
      title: 'Пари',
      what: 'Кожен елемент ліворуч треба з’єднати з парою праворуч.',
      how: [
        'Гравець торкається елемента ліворуч, потім праворуч, і натискає «Відповісти».',
        'Правий стовпчик гравці бачать перемішаним.',
      ],
      points: ['Ціна — лише коли всі пари правильні; інакше 0.'],
      tip: ['Однакова довжина й вигляд елементів праворуч не дають вгадати пару за формою.'],
      limits: [`${LIMITS.minPairs}–${LIMITS.maxPairs} пар.`],
    },
    chain: {
      title: 'Ланцюжок слів',
      what: 'Ланцюжок пов’язаних слів: перше видно всім, решту треба вгадати по черзі.',
      how: [
        'Гравці бачать перше слово, а наступне — лише першою літерою й кількістю літер.',
        'Кожен вгадує у своєму темпі. «Підказка» відкриває ще одну літеру, але додає секунди до часу гравця.',
        'Сцена показує поступ гравців без самих слів.',
      ],
      points: [
        'Хто пройшов увесь ланцюжок, отримує бали: найшвидший — повну ціну, решта — менше, аж до половини ціни для того, хто закінчив на межі часу.',
        'Хто не дійшов до кінця — 0.',
        'У фіналі пройдений ланцюжок дає плюс ставку.',
      ],
      tip: ['Перевірте ланцюжок уголос: кожне слово має природно випливати з попереднього.'],
      limits: [`${LIMITS.minChainWords}–${LIMITS.maxChainWords} слів.`, 'Лише в класичному раунді й у фіналі.', 'Без відео й без бафів.'],
    },
    sort: {
      title: 'Сортування',
      what: 'Слова треба розкласти по категоріях.',
      how: [
        'Категорії стоять по краях екрана телефона, слова йдуть по одному. Гравець перетягує картку, торкається категорії або натискає стрілку.',
        'Після помилки слово йде в кінець черги, а екран гравця «підвисає» на задані секунди.',
      ],
      points: [
        'Бали — за кожне правильно розкладене слово.',
        'У бліці бали отримує лише той, хто першим розклав усі слова; у фіналі плюс ставка — лише за всі слова.',
        'На полі сортує тільки той, хто вибрав клітинку.',
      ],
      tip: [`Разом (слова × бали за слово) — не більше ${LIMITS.maxPoints}.`],
      limits: [
        `${LIMITS.minSortCategories}–${LIMITS.maxSortCategories} категорії, ${LIMITS.minSortWords}–${LIMITS.maxSortWords} слів.`,
        'Без відео й без бафів.',
        'На полі — лише звичайна клітинка з телефона.',
      ],
    },
  };
  ```

  **`cells.ts`**
  ```ts
  export const CELL_HELP: Record<CellHelpKey, HelpEntry> = {
    normal: {
      title: 'Звичайна клітинка',
      what: 'Запитання для того, хто вибрав клітинку.',
      how: [
        'Відповідає лише гравець, чий хід, — з телефона або вголос, як задано в клітинці. Решта бачать запитання на сцені.',
        'Бафи на звичайній клітинці теж бере лише він.',
      ],
      points: ['Ціна × позначка × множник раунду. Зі штрафом «мінус» помилка й мовчання знімають стільки ж.'],
      tip: ['Більшість клітинок поля — звичайні, а особливі розставляйте точково.'],
    },
    blitz: {
      title: 'Бліц-клітинка',
      what: 'Клітинка, на яку відповідають усі: бали отримує перший, хто відповів правильно.',
      how: [
        'З телефона й автоматичною перевіркою — миттєво: кожен відповідає один раз, а ви по черзі натискаєте «Прийняти».',
        `З телефона й ручною перевіркою гравці тиснуть «Відповісти»: у кожного ${DEFAULT_ANSWER_WINDOW} секунд на відповідь, спроб скільки завгодно, оцінюєте ви.`,
        'Усно: гравці тиснуть «Відповісти» і відповідають уголос по черзі, оцінюєте ви.',
      ],
      points: [
        'Перший правильний отримує ціну × позначку × множник раунду, а якщо це той, хто вибрав клітинку, — удвічі більше.',
        'Неправильна спроба коштує 0: штраф раунду тут не діє.',
        'Штраф «Мінус для всіх»: усі, крім того, хто вгадав, утрачають ціну клітинки (× позначка × множник), зокрема ті, хто мовчав.',
      ],
      tip: ['Бліц на дорогому запитанні розворушить тих, хто чекає своєї черги.'],
      limits: ['Бафів на бліц-клітинці немає.', 'Сортування не буває на бліц-клітинці.'],
    },
    voice: {
      title: 'Відповідь уголос',
      what: 'Гравець відповідає вголос, а оцінюєте ви.',
      how: [
        'Телефон гравця пише «Відповідайте вголос», запитання — на сцені.',
        'У запитанні з варіантами чи «так/ні» торкніться на пульті варіанта, який назвав гравець, — сцена його підсвітить.',
        'Оцініть: «Зарахувати», «Частково» (з правилом «частково») або «Не зараховувати».',
      ],
      points: ['Як на звичайній клітинці: ціна × позначка × множник раунду, штраф «мінус» діє.'],
      tip: [
        'Підходить для запитань, де важливе пояснення, і для гравців без телефона під рукою.',
        'Бафи гравець бере з телефона й на усній клітинці, крім «Другої спроби».',
      ],
      limits: [
        '«Друга спроба» тут не діє.',
        'Дебаф на усній клітинці не спрацьовує: він чекає запитання, де гравець відповідає з телефона.',
      ],
    },
    marks: {
      title: '×2 і ×3',
      what: 'Позначка множить ціну клітинки вдвічі чи втричі.',
      how: [
        'Гравці й сцена не бачать позначок на полі — це сюрприз: після перегортання клітинки всі бачать «×2!» чи «×3!».',
        'На пульті позначки видно завжди.',
      ],
      points: [
        'Множиться все: бали за правильну відповідь, штраф «мінус» і «Мінус для всіх».',
        'Множник раунду діє зверху: ×2 у раунді з множником ×3 дає ×6.',
      ],
      tip: ['На поле досить однієї-двох позначок; ставте їх на складні запитання.'],
    },
  };
  ```
  (`CELL_KINDS`, `DEFAULT_ANSWER_WINDOW` імпортувати з `@quiz/shared`.)

- [ ] **Step 1: Write the failing tests.**
  - `packages/shared/src/quiz.test.ts`:
    ```ts
    describe('type lists', () => {
      it('ROUND_TYPES and QUESTION_TYPES list every schema discriminator in editor order', () => {
        expect(roundSchema.options.map((o) => o.shape.type.value)).toEqual([...ROUND_TYPES]);
        expect(questionSchema.options.map((o) => o.shape.type.value)).toEqual([...QUESTION_TYPES]);
      });
    });
    ```
    (Імпорти — з `./index`. Якщо в zod 4 `questionSchema` після `.superRefine` не має `.options`, порівняти через `questionSchema.def.options` або через `z.toJSONSchema`. Головне, щоб тест падав, коли в схемі з'являється тип, якого немає в переліку.)
  - `apps/web/src/help/host-help.test.ts`:
    ```ts
    import { CELL_KINDS, QUESTION_TYPES, ROUND_TYPES } from '@quiz/shared';
    import { t, type TextKey } from '../i18n';
    import { ROUND_NAMES } from '../guide-text';
    import { HELP_TOPICS, cellHelpId, helpAnchor, helpEntry, helpIds, helpTopic, searchHelp, type HelpId } from './host-help';

    const SENTENCE_END = /[.!?…](?=\s|$)/g;
    const filled = (id: HelpId) => {
      const e = helpEntry(id);
      expect(e.title.trim(), id).not.toBe('');
      expect(e.what.trim(), id).not.toBe('');
      expect((e.what.match(SENTENCE_END) ?? []).length, `${id}: «Що це» — одне-два речення`).toBeLessThanOrEqual(2);
      for (const list of [e.how, e.points, e.tip]) {
        expect(list.length, id).toBeGreaterThan(0);
        for (const line of list) expect(line.trim(), id).not.toBe('');
      }
      if (e.limits !== undefined) expect(e.limits.length, id).toBeGreaterThan(0);
    };

    describe('host help', () => {
      it('every round type, question type and cell kind has an entry', () => {
        for (const type of ROUND_TYPES) filled(`round.${type}`);
        for (const type of QUESTION_TYPES) filled(`question.${type}`);
        for (const kind of CELL_KINDS) filled(`cell.${kind}`);
        filled('cell.voice');
        filled('cell.marks');
      });

      it('titles match the names in the interface', () => {
        for (const type of ROUND_TYPES) expect(helpEntry(`round.${type}`).title).toBe(t(ROUND_NAMES[type]));
        for (const type of QUESTION_TYPES) expect(helpEntry(`question.${type}`).title).toBe(t(`type_${type}` as TextKey));
      });

      it('topics list their entries in the order of the shared lists; ids are unique', () => {
        expect(helpIds('rounds')).toEqual(ROUND_TYPES.map((type) => `round.${type}`));
        expect(helpIds('questions')).toEqual(QUESTION_TYPES.map((type) => `question.${type}`));
        expect(helpIds('cells')).toEqual(['cell.normal', 'cell.blitz', 'cell.voice', 'cell.marks']);
        expect(helpIds('teams')).toEqual([]);
        const all = HELP_TOPICS.flatMap(helpIds);
        expect(new Set(all).size).toBe(all.length);
        for (const id of all) expect(helpIds(helpTopic(id))).toContain(id);
      });

      it('anchors and search by name', () => {
        expect(helpAnchor('round.board')).toBe('help-round-board');
        expect(searchHelp('')).toEqual(HELP_TOPICS.flatMap(helpIds));
        expect(searchHelp('  ПОЛЕ ')).toEqual(['round.board']);
        expect(searchHelp('клітинка')).toEqual(['cell.normal', 'cell.blitz']);
        expect(searchHelp('зззз')).toEqual([]);
      });

      it('picks the entry of a board cell', () => {
        expect(cellHelpId({ kind: 'blitz', answerMode: 'voice', mark: 'x2' })).toBe('cell.blitz');
        expect(cellHelpId({ kind: 'normal', answerMode: 'voice', mark: 'x3' })).toBe('cell.voice');
        expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'x2' })).toBe('cell.marks');
        expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'none' })).toBe('cell.normal');
      });
    });
    ```
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared apps/web/src/help`. Очікується FAIL: немає переліків, модуля `help`, експорту `ROUND_NAMES`.
- [ ] **Step 3: Implement** за Interfaces: переліки, реекспорт у `draft.ts`, експорти в `guide-text.ts`, файли `help/` з текстами вище, функції `host-help.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages apps/web`. Очікується PASS, зокрема наявні `draft.test.ts` і `guide-text.test.ts`.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared apps/web/src/editor/draft.ts apps/web/src/guide-text.ts apps/web/src/help
  git commit -m "feat: ROUND_TYPES and QUESTION_TYPES in shared; host help skeleton with entries for every round type, question type and board cell"
  ```

---

### Задача 2. Тексти бафів, дебафів і налаштувань; звірка з текстами гравців

**Files:**
- Create: `apps/web/src/help/powers.ts`, `apps/web/src/help/settings.ts`
- Modify: `apps/web/src/help/host-help.ts` (теми `buffs`, `debuffs`, `settings` замість `none(...)`)
- Modify: `apps/web/src/help/host-help.test.ts`

**Interfaces:**
- Produces (`powers.ts`): `export const BUFF_HELP: Record<BuffKind, HelpEntry>`, `export const DEBUFF_HELP: Record<DebuffKind, HelpEntry>`.
- Produces (`settings.ts`):
  ```ts
  /** Налаштування з довідкою в порядку довідника. */
  export const SETTING_HELP_KEYS = ['leaderboard', 'newcomers', 'speedBonus', 'spares', 'debuffShop', 'duels', 'penalty', 'partial', 'streak', 'multiplier'] as const;
  export type SettingHelpKey = (typeof SETTING_HELP_KEYS)[number];
  export const SETTING_HELP: Record<SettingHelpKey, HelpEntry>;
  ```
- `host-help.ts`: `buffs: topic('buff', BUFF_KINDS, BUFF_HELP)`, `debuffs: topic('debuff', DEBUFF_KINDS, DEBUFF_HELP)`, `settings: topic('setting', SETTING_HELP_KEYS, SETTING_HELP)`.

- **Тексти:**

  **`powers.ts`**
  ```ts
  /** Як дебаф потрапляє до цілі — спільний рядок «Як іде в грі» кожного дебафу. */
  const CAST = 'Ви насилаєте дебаф безкоштовно з рядка гравця на пульті («Дебаф»), а гравці купують його суперникам за бали. Він спрацює в наступному запитанні, де ціль відповідає з телефона, і діє до кінця цього запитання.';
  const COST = 'Балів дебаф не змінює — лише заважає; покупець платить його ціну.';

  export const BUFF_HELP: Record<BuffKind, HelpEntry> = {
    fifty: {
      title: '50/50',
      what: 'Прибирає частину неправильних варіантів для гравця, що взяв баф.',
      how: [
        'Гравець двічі торкається кнопки бафу під запитанням — неправильні варіанти закреслюються в його телефоні, а на клітинці поля й на сцені.',
        'Скільки прибирається: з 3 варіантів — 1, з 4 — 2, з 6 — 3. У «кількох правильних» — половина неправильних, але один неправильний завжди лишається.',
      ],
      points: ['Бали звичайні.'],
      tip: ['Найсильніший на запитаннях з 4 варіантами.'],
      limits: ['Лише запитання з варіантами (щонайменше 3 варіанти) у класиці й на полі.'],
    },
    double: {
      title: 'Подвійні бали',
      what: 'Подвоює бали гравця за це запитання.',
      how: ['Гравець бере баф до відповіді. Сцена й пульт показують, хто взяв баф.'],
      points: [
        'Подвоюються лише додатні бали, разом із бонусом серії. Мінус за помилку не подвоюється.',
        'Позначка клітинки й множник раунду множать далі.',
      ],
      tip: ['Найвигідніший на дорогій клітинці ×2 чи ×3.'],
      limits: ['Класика й поле у свій хід, зокрема усні клітинки.'],
    },
    retry: {
      title: 'Друга спроба',
      what: 'Після неправильної відповіді гравець відповідає ще раз.',
      how: [
        'Перша відповідь неправильна — телефон пише «Неправильно, ще одна спроба».',
        'Перша відповідь часткова — гравець вибирає: «Залишити» бали чи «Ще спроба».',
        'Якщо час сплив до другої відповіді, рахується перша.',
      ],
      points: ['Рахується друга відповідь (або залишена перша).'],
      tip: ['Найкорисніша на текстових відповідях і числах.'],
      limits: ['Лише прості типи: варіанти, так/ні, текст, число.', 'Не діє вголос і на полі з ручною перевіркою.'],
    },
    time: {
      title: 'Додатковий час',
      what: '+30 секунд лише цьому гравцеві.',
      how: [
        'Таймер гравця подовжується, інші відповідають у звичайний час.',
        'Коли решта вже відповіли, пульт показує «Чекаємо: …» з часом гравця — можна натиснути «Не чекати» й закрити запитання.',
      ],
      points: ['Бали звичайні. Бонус за швидкість рахується від звичайного часу: відповідь у додаткові секунди — як в останню секунду.'],
      tip: ['Рятує на довгих запитаннях — впорядкуванні й парах.'],
      limits: ['Лише запитання з таймером (не з відео) у класиці й на полі.'],
    },
    shield: {
      title: 'Щит',
      what: 'Помилка не знімає балів.',
      how: ['Гравець бере щит до відповіді. Якщо відповідь мала б коштувати мінус, гравець отримує 0.'],
      points: ['Мінус стає 0. Правильна відповідь рахується як звичайно.'],
      tip: ['Має сенс лише в раундах зі штрафом «мінус» — в інших баф неактивний.'],
      limits: ['Лише там, де помилка коштує балів (правило «мінус»).'],
    },
    audience: {
      title: 'Запитання в залі',
      what: 'Решта гравців 15 секунд голосують, яку відповідь дали б вони.',
      how: [
        'Гравець бере баф, і іншим гравцям приходить «… питає зал: як думаєте?» з його ім’ям.',
        'У класиці голосують ті, хто вже відповів; на полі — усі, крім того, хто вибрав клітинку.',
        'Гравець бачить відсотки за варіанти, а для тексту й числа — здогадки залу.',
        'Якщо в запитання є таймер, гравець отримує +15 секунд, поки зал голосує.',
      ],
      points: ['Бали звичайні. Голоси залу балів не дають і не знімають.'],
      tip: ['У класиці баф корисніший ближче до кінця таймера, коли більшість уже відповіла.'],
      limits: ['Лише прості типи: варіанти, так/ні, текст, число.', 'Потрібен хоча б один гравець, який може проголосувати.'],
    },
    hint: {
      title: 'Підказка ведучого',
      what: 'Гравець отримує підказку до цього запитання.',
      how: [
        'Якщо в редакторі заповнено «Підказку», гравець бачить її одразу.',
        'Якщо ні, пульт показує «… просить підказку» з ім’ям гравця. Напишіть підказку й натисніть «Надіслати» або підкажіть уголос і натисніть «Підказав уголос».',
      ],
      points: ['Бали звичайні.'],
      tip: ['Заповнюйте підказки в редакторі для складних запитань — не доведеться вигадувати на ходу.'],
      limits: ['Класика й поле у свій хід, зокрема усні клітинки.'],
    },
    swap: {
      title: 'Заміна запитання',
      what: 'Гравець отримує інше запитання із запасних замість поточного.',
      how: [
        'Гравець бере баф, і в його телефоні з’являється наступне невикористане запасне; інші відповідають на основне.',
        'На полі запасне бачать усі, бо відповідає лише той, хто вибрав. Воно береться з тієї ж категорії, якщо категорії мають власні запасні.',
        'Кожне запасне видається лише раз за гру.',
      ],
      points: [
        'Ціна, множники й штраф — від поточного запитання.',
        'Після заміни в гравця щонайменше 20 секунд; бонус за швидкість рахується від миті заміни.',
      ],
      tip: ['Заповніть загальні запасні для класики й по 1–2 запасні в кожній категорії поля.'],
      limits: ['Без запасних запитань баф не зберегти.', 'Запасні — лише прості типи без відео.'],
    },
  };

  export const DEBUFF_HELP: Record<DebuffKind, HelpEntry> = {
    shake: {
      title: 'Тремтіння екрана',
      what: 'Екран телефона цілі тремтить поштовхами, а телефон вібрує.',
      how: [CAST, 'Поштовхи повторюються кожні кілька секунд.'],
      points: [COST],
      tip: ['Найдошкульніший на запитаннях з дрібними варіантами.'],
    },
    fog: {
      title: 'Туман',
      what: 'Туман закриває екран; ціль протирає його пальцем.',
      how: [CAST, 'Телефон підказує: «Протріть екран пальцем, щоб розвіяти туман».'],
      points: [COST],
      tip: ['Добре проти тих, хто відповідає за першу секунду.'],
    },
    freeze: {
      title: 'Заморозка',
      what: 'Лід ненадовго закриває екран — торкатися відповіді не можна.',
      how: [CAST, 'Лід тримається 5 секунд, але не довше половини часу запитання, а потім розсипається.'],
      points: [COST],
      tip: ['На короткому запитанні вона з’їдає помітну частку часу.'],
    },
    mirror: {
      title: 'Дзеркало',
      what: 'Варіанти відповіді переставляються по колу кожні 4 секунди.',
      how: [CAST, 'Рухаються варіанти «одного» й «кількох правильних», а в сортуванні — зони категорій.'],
      points: [COST],
      tip: ['На інших типах запитань дзеркало нічого не рухає — насилайте його перед запитаннями з варіантами.'],
    },
    guests: {
      title: 'Гості на екрані',
      what: 'Екраном ходять тварини — сонечко, кіт і пес — і відволікають ціль.',
      how: [CAST],
      points: [COST],
      tip: ['Найбезневинніший дебаф — для дружньої компанії й дітей.'],
    },
    mud: {
      title: 'Брудний екран',
      what: 'Плями бруду на екрані; ціль протирає їх пальцем.',
      how: [CAST, 'Телефон підказує: «Протріть плями пальцем».'],
      points: [COST],
      tip: ['Як і туман, змушує витратити кілька секунд.'],
    },
  };
  ```
  Пояснення до «Як іде в грі» дебафів: обмеження «спрацює, де ціль відповідає з телефона» вже є в `CAST`. На звичайній клітинці поля з телефона відповідає лише той, хто вибрав; на усній — ніхто; на бліц-клітинці й в інших раундах — усі (`answerersOf`).

  **`settings.ts`**
  ```ts
  export const SETTING_HELP: Record<SettingHelpKey, HelpEntry> = {
    leaderboard: {
      title: 'Показувати рейтинг',
      what: 'Коли гравці бачать таблицю балів.',
      how: [
        '«Після кожного запитання»: після розкриття йде екран рейтингу, а на полі — після кожної клітинки.',
        '«Лише в кінці гри»: рейтингу між запитаннями немає, а підсумки раунду й подіум лишаються. Кнопка «Таблиця» на телефоні до того показує гравцеві лише його власне місце.',
      ],
      points: ['На бали не впливає.'],
      tip: ['«Лише в кінці» тримає інтригу й пришвидшує гру; «після кожного» додає змагального настрою.'],
    },
    newcomers: {
      title: 'Пояснення для новачків',
      what: 'Короткі правила саме цієї вікторини для гравців, які грають уперше.',
      how: [
        'Перед грою на сцені, телефонах і пульті йдуть екрани «Як грати»: телефон, раунди, типи запитань, бафи, дебафи, дуелі. Ви гортаєте їх «Далі» або пропускаєте «До гри».',
        'Перед кожним раундом заставка показує пам’ятку «Як проходить раунд».',
        'Перед першим запитанням кожного типу телефон показує підказку, як відповідати; таймер при цьому іде.',
      ],
      points: ['На бали не впливає.'],
      tip: ['Вмикайте для нової компанії; для постійних гравців можна вимкнути.'],
    },
    speedBonus: {
      title: 'Бали за швидкість',
      what: 'У класичному раунді швидша правильна відповідь дає більше балів.',
      how: ['Гравці бачать звичайний таймер, бонус рахується сам.'],
      points: [
        'Відповідь одразу — 100 % балів, в останню секунду — 50 %, між ними — рівномірно.',
        'Діє й на часткові бали; на запасному запитанні час рахується від миті заміни.',
      ],
      tip: ['Вимикайте для запитань, де треба подумати, — інакше вирішує реакція.'],
      limits: ['Лише класичні раунди й лише запитання з таймером (не з відео).', 'У бліці, на полі й у фіналі бонусу немає.'],
    },
    spares: {
      title: 'Запасні запитання',
      what: 'Запитання для бафу «Заміна запитання».',
      how: [
        `Загальні запасні (до ${LIMITS.maxSpares}) використовуються в класичних раундах.`,
        `Кожна категорія поля може мати власні запасні (до ${LIMITS.maxCategorySpares}). Щойно хоч одна категорія їх має, кожна клітинка бере запасне лише зі своєї категорії, а в категорії без запасних заміна недоступна.`,
        'Поки жодна категорія не має власних, поле бере загальні.',
        'Запасні видаються по черзі, кожне — лише раз за гру.',
      ],
      points: ['Ціна й час — від запитання, яке замінили: власних балів і часу запасні не мають.'],
      tip: ['Запасних має вистачити всім, хто візьме заміну: щонайменше стільки, скільки гравців.'],
      limits: ['Лише прості типи (варіанти, кілька, так/ні, текст, число), без відео.'],
    },
    debuffShop: {
      title: 'Крамниця дебафів',
      what: 'Гравці можуть купувати дебафи суперникам за власні бали.',
      how: [
        'У телефоні є кнопка «Дебафи» 😈: гравець вибирає дебаф і суперника, а бали списуються одразу.',
        'Між двома запитаннями — одна покупка. Суперник має бути в грі й без іншого дебафу.',
        'Дебаф спрацює в наступному запитанні, де суперник відповідає з телефона. Усі бачать, хто кого атакував.',
        'Ви насилаєте дебафи безкоштовно з рядка гравця на пульті. Свій дебаф можна скасувати до спрацювання, куплений — ні.',
      ],
      points: [
        `Ціна задається окремо для кожного дебафу: від ${LIMITS.minDebuffPrice} до ${LIMITS.maxDebuffPrice} балів, типово ${LIMITS.defaultDebuffPrice}.`,
        'Піти в мінус покупкою не можна.',
      ],
      tip: [
        'Ціна близько 20 % ціни звичайного запитання робить покупки частими, а дорожча — рідкісними й болючими.',
        'Зніміть прапорець «Гравці можуть купувати дебафи», щоб дебафи насилали лише ви.',
      ],
      limits: ['Не купується у фінальному раунді, на паузі й під час дуелі.'],
    },
    duels: {
      title: 'Дуелі',
      what: 'Гравець може раз за гру викликати суперника на дуель на окремих запитаннях.',
      how: [
        'Після третини запитань (без фіналу) у телефоні з’являється «⚔ Дуель». Викликати можна до фіналу або до останнього раунду; суперник відмовитися не може.',
        'Дуель починається після поточного запитання із заставкою «Дуель!». Той, хто викликав, вибирає категорію (або ви за нього).',
        'Обоє вписують відповіді, спроб скільки завгодно; перший правильний виграє запитання. Ви можете пропустити запитання або скасувати дуель.',
      ],
      points: ['Перемагає той, хто виграв більше запитань, і забирає в суперника ставку. Нічия — бали не змінюються.'],
      tip: ['У кожній категорії має бути щонайменше стільки запитань, скільки за одну дуель; краще більше — категорію можуть вибрати двічі.'],
      limits: ['Відповіді в дуелі — лише текстом.', 'Бафів і дебафів у дуелі немає.'],
    },
    penalty: {
      title: 'Штраф «мінус»',
      what: 'Неправильна відповідь знімає ціну запитання.',
      how: ['Гравці бачать правило в пам’ятці раунду.'],
      points: [
        'Класика: мінус лише за дану неправильну відповідь; мовчання — 0.',
        'Поле: мінус за помилку й за мовчання гравця, чий хід, на звичайній клітинці.',
        'Бліц: мінус за кожну неправильну спробу. Бліц-клітинки штрафу раунду не мають — для них є «Мінус для всіх».',
        'Штраф множиться на множник раунду й позначку клітинки. «Щит» перетворює мінус на 0.',
      ],
      tip: ['Зі штрафом гравці частіше утримуються — добре для запитань «так чи ні».'],
      limits: ['У фіналі штрафу немає — там ставки.'],
    },
    partial: {
      title: 'Кнопка «частково»',
      what: 'Дає вам оцінку «Частково» з заданою часткою балів.',
      how: [
        'Класика: на розкритті ви можете поставити гравцеві «Частково».',
        'Поле: «Частково» є в оцінці усної відповіді й відповіді з ручною перевіркою, а впорядкування й число з відхиленням за автоматичної перевірки отримують свою частку.',
      ],
      points: [
        'Частка — від 10 до 90 % ціни (× множник раунду).',
        'Без цього правила майже правильна відповідь на полі дає 0. У класиці впорядкування й число з відхиленням дають частку автоматично й без правила.',
      ],
      tip: ['Корисно для відповідей «майже»: прізвище без імені, рік без місяця.'],
      limits: ['У бліці й фіналі «частково» немає.'],
    },
    streak: {
      title: 'Серії',
      what: 'Бонус за кілька правильних відповідей поспіль.',
      how: [
        'Гравець бачить 🔥 із довжиною серії.',
        'Серія рахується в межах раунду; на полі — лише за власні клітинки гравця.',
      ],
      points: [
        'Починаючи з заданої кількості правильних поспіль, кожна правильна відповідь додає бонус: відсоток від її балів або фіксовану суму.',
        'Часткова чи неправильна відповідь або мовчання обривають серію.',
        'З «Подвійними балами» бонус теж подвоюється.',
      ],
      tip: ['Серія з 3 відповідей і бонус 20–50 % помітні, але не вирішують гру.'],
      limits: ['У фіналі серій немає.'],
    },
    multiplier: {
      title: 'Множник балів',
      what: 'Усі бали раунду ×2 або ×3.',
      how: ['Пам’ятка раунду показує «Усі бали ×N».'],
      points: ['Множаться бали за відповіді й штрафи, а на полі — разом із ×2/×3 клітинки.'],
      tip: ['Останній раунд з ×2 дає шанс тим, хто відстає.'],
      limits: ['У фіналі множника немає — там ставки.'],
    },
  };
  ```

- [ ] **Step 1: Write the failing tests** у `host-help.test.ts`:
  ```ts
  import { BUFF_KINDS, DEBUFF_KINDS, LIMITS } from '@quiz/shared';
  import { buffName } from '../buff-meta';
  import { debuffName } from '../debuff-meta';
  import { MIRROR_SWAP_MS, freezeMs } from '../screens/Debuffs';
  import { SETTING_HELP_KEYS } from './settings';

  const text = (id: HelpId) => {
    const e = helpEntry(id);
    return [e.title, e.what, ...e.how, ...e.points, ...e.tip, ...(e.limits ?? [])].join(' ');
  };

  it('every buff, debuff and listed setting has an entry', () => {
    for (const kind of BUFF_KINDS) filled(`buff.${kind}`);
    for (const kind of DEBUFF_KINDS) filled(`debuff.${kind}`);
    for (const key of SETTING_HELP_KEYS) filled(`setting.${key}`);
    expect(helpIds('buffs')).toEqual(BUFF_KINDS.map((kind) => `buff.${kind}`));
    expect(helpIds('debuffs')).toEqual(DEBUFF_KINDS.map((kind) => `debuff.${kind}`));
    expect(helpIds('settings')).toEqual(SETTING_HELP_KEYS.map((key) => `setting.${key}`));
  });

  it('host help agrees with the player texts', () => {
    for (const kind of BUFF_KINDS) expect(helpEntry(`buff.${kind}`).title).toBe(buffName(kind));
    for (const kind of DEBUFF_KINDS) expect(helpEntry(`debuff.${kind}`).title).toBe(debuffName(kind));
    // Числа, які гравці бачать у своїх текстах.
    expect(t('buffGuide_time')).toContain('30 секунд');
    expect(text('buff.time')).toContain('30 секунд');
    expect(t('buffGuide_audience')).toContain('15 с');
    expect(text('buff.audience')).toContain('15 секунд');
    expect(t('swapMine')).toContain('20 с');
    expect(text('buff.swap')).toContain('20 секунд');
    expect(text('debuff.mirror')).toContain(`${MIRROR_SWAP_MS / 1000} секунди`);
    expect(text('debuff.freeze')).toContain(`${freezeMs(null) / 1000} секунд`);
    expect(text('setting.debuffShop')).toContain(`типово ${LIMITS.defaultDebuffPrice}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxSpares}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxCategorySpares}`);
    // Де бафів немає — те саме, що в «?» гравця (buffHelpNone): бліц, бліц-клітинки, фінал, ланцюжок, сортування, дуелі.
    expect(text('round.blitz')).toContain('Бафи в бліці не діють');
    expect(text('cell.blitz')).toContain('Бафів на бліц-клітинці немає');
    expect(text('round.final')).toContain('бафів у фіналі немає');
    expect(text('question.chain')).toContain('без бафів');
    expect(text('question.sort')).toContain('без бафів');
    expect(text('setting.duels')).toContain('Бафів і дебафів у дуелі немає');
  });

  it('search finds buffs and debuffs by name', () => {
    expect(searchHelp('щит')).toEqual(['buff.shield']);
    expect(searchHelp('50')).toEqual(['buff.fifty']);
    expect(searchHelp('ЗАМІНА')).toEqual(['buff.swap']);
    expect(searchHelp('туман')).toEqual(['debuff.fog']);
  });
  ```
  Тест задачі 1 (`searchHelp('клітинка')`, `searchHelp('  ПОЛЕ ')`) лишається: записів бафів, дебафів і налаштувань зі словом «клітинка» в назві немає. Якщо імпорт `../screens/Debuffs` тягне в тест зайве (React-компоненти), це допустимо — він уже чистий модуль без побічних ефектів. Інакше винести `MIRROR_SWAP_MS` і `freezeMs` у `apps/web/src/debuff-meta.ts` і реекспортувати з `Debuffs.tsx`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help`. Очікується FAIL: `buff.*`, `debuff.*`, `setting.*` не мають записів (а з `none(...)` — ще й помилки типів у тесті).
- [ ] **Step 3: Implement** за Interfaces і текстами.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help
  git commit -m "feat(web): host help for every buff, debuff and key setting (leaderboard, newcomers, speed bonus, spares, debuff shop, duels, penalty, partial, streaks, multiplier); names and numbers match the player texts"
  ```

---

### Задача 3. Кнопка «ⓘ» і немодальне вікно довідки

**Files:**
- Create: `apps/web/src/help/HelpButton.tsx`
- Create: `apps/web/src/help/HelpButton.test.tsx`
- Modify: `apps/web/src/i18n.ts` (підписи довідки)
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Produces (`HelpButton.tsx`):
  ```tsx
  /** Розділи запису: «Що це», «Як іде в грі», «Бали», «Порада», [«Обмеження»]; level — рівень заголовків розділів. */
  export function HelpBody({ entry, level = 3 }: { entry: HelpEntry; level?: 3 | 4 }): JSX.Element;
  /**
   * Кнопка «ⓘ» і немодальне вікно довідки (портал у body). Нічого не надсилає й не змінює —
   * працює на паузі, під час гри й у редакторі без позначки «змінено».
   */
  export function HelpButton({ id, className }: { id: HelpId; className?: string }): JSX.Element;
  ```
  - Кнопка: `<button type="button" className="help-button" aria-label={t('helpOpen', { title })} aria-haspopup="dialog" aria-expanded={open}>` з `<span aria-hidden="true">ⓘ</span>`. `onClick`: `event.preventDefault(); event.stopPropagation();` (страховка всередині `label`/`details`), потім перемкнути.
  - Вікно: `<div className="help-pop" role="dialog" aria-modal="false" aria-labelledby={headingId}>`, де `headingId = useId()`. Усередині — `<h2 id={headingId}>{title}</h2>`, `<HelpBody entry={entry} />`, рядок дій: `<a href={`/help#${helpAnchor(id)}`} target="_blank" rel="noreferrer">{t('helpAll')}</a>` і `<button type="button" className="btn btn-small">{t('helpClose')}</button>`.
  - Закриття:
    - кнопкою «Закрити» або клавішею Escape (на `document`, поки вікно відкрите) — фокус повертається на «ⓘ»;
    - `pointerdown` на `document` поза вікном і поза своєю кнопкою — без повернення фокуса і без `preventDefault`, тож дотик іде далі до того, у що влучив.
  - Одне вікно на сторінці. Відкриваючи вікно, кнопка надсилає `window.dispatchEvent(new CustomEvent('quiz-help-open', { detail: token }))`, де `token = useId()`. Інші кнопки на цю подію закриваються, якщо `detail !== свій token`.
  - Після відкриття фокус переходить на заголовок (`tabIndex={-1}`), щоб скрінрідер прочитав назву.
  - `HelpBody`: для кожного розділу заголовок `h{level}` з текстом `helpWhat`/`helpHow`/`helpPoints`/`helpTip`/`helpLimits`. «Що це» йде абзацом `<p>`, решта — `<ul>` з `<li>`.
- i18n (додати в блок поруч із `buffHelp*`):
  ```ts
  helpOpen: 'Довідка: {title}',
  helpWhat: 'Що це',
  helpHow: 'Як іде в грі',
  helpPoints: 'Бали',
  helpTip: 'Порада',
  helpLimits: 'Обмеження',
  helpClose: 'Закрити',
  helpAll: 'Усі пояснення',
  helpTitle: 'Довідка ведучого',
  helpLink: 'Довідка ведучого',
  helpLead: 'Що означає кожен раунд, тип запитання, клітинка, баф, дебаф і налаштування, як іде в грі й як рахуються бали.',
  helpSearch: 'Пошук за назвою',
  helpNothing: 'Нічого не знайдено.',
  helpTopic_rounds: 'Раунди',
  helpTopic_questions: 'Типи запитань',
  helpTopic_cells: 'Клітинки поля',
  helpTopic_buffs: 'Бафи',
  helpTopic_debuffs: 'Дебафи',
  helpTopic_settings: 'Налаштування',
  helpTopic_teams: 'Команди',
  ```
- styles.css (поруч із `.buff-help*`; токени ті самі: `--stage`, `--paper`, `--line`, `--dim`):
  - `.help-button` — як `.buff-help`, але 1.5rem, `margin-inline-start: 0.35rem`, `vertical-align: middle`, зона дотику 44 px через `::after { inset: -10px }`.
  - `.help-pop`: `position: fixed; z-index: 75; right: 1rem; bottom: 5.5rem` (над липким `.actions`); `width: min(26rem, calc(100vw - 2rem)); max-height: 70vh; overflow-y: auto; padding: 1rem; border: 1px solid var(--line); border-radius: 1rem; background: var(--stage); color: var(--paper); box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.35)`.
  - `.help-pop h2` (1.1rem), `.help-pop h3` (0.95rem, `color: var(--dim)`, `margin: 0.75rem 0 0.25rem`), `.help-pop ul` (`padding-inline-start: 1.1rem; margin: 0`).
  - `.help-pop-actions` — flex, `justify-content: space-between`, `margin-top: 1rem`.
  - `@media (max-width: 600px) { .help-pop { inset: auto 0 0 0; width: auto; border-radius: 1rem 1rem 0 0; border-width: 1px 0 0; max-height: 75vh; padding-bottom: max(1rem, env(safe-area-inset-bottom)); } }`.
  - `.with-help` — `display: flex; align-items: center; gap: 0.25rem;`, а для `label`/`.field` всередині — `flex: 1`. Спільна обгортка для задач 5–6.

- [ ] **Step 1: Write the failing tests** (`HelpButton.test.tsx`, `// @vitest-environment jsdom`):
  ```tsx
  it('opens a non-modal dialog with the sections of the entry and a link to the reference', () => {
    render(<HelpButton id="buff.shield" />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Щит' }));
    const dialog = screen.getByRole('dialog', { name: 'Щит' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    for (const heading of ['Що це', 'Як іде в грі', 'Бали', 'Порада', 'Обмеження']) within(dialog).getByRole('heading', { name: heading });
    within(dialog).getByText('Помилка не знімає балів.');
    const link = within(dialog).getByRole('link', { name: 'Усі пояснення' });
    expect(link.getAttribute('href')).toBe('/help#help-buff-shield');
    expect(link.getAttribute('target')).toBe('_blank');
  });
  it('an entry without limits has no «Обмеження»', () => {
    render(<HelpButton id="question.boolean" />);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Так чи ні' }));
    expect(within(screen.getByRole('dialog')).queryByRole('heading', { name: 'Обмеження' })).toBeNull();
  });
  it('Escape and «Закрити» close it and return the focus to ⓘ', () => { /* відкрити → keyDown(document, { key: 'Escape' }) → немає dialog, document.activeElement === кнопка; знову відкрити → «Закрити» → так само */ });
  it('a tap outside closes it and still reaches what was tapped', () => {
    const onClick = vi.fn();
    render(<><HelpButton id="round.board" /><button type="button" onClick={onClick}>Далі</button></>);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Ігрове поле' }));
    const next = screen.getByRole('button', { name: 'Далі' });
    fireEvent.pointerDown(next);
    fireEvent.click(next);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('only one dialog is open at a time', () => { /* дві кнопки (round.final, buff.swap): відкрити першу, потім другу → лише dialog «Заміна запитання» */ });
  it('inside a label it does not toggle the checkbox', () => {
    render(<label><input type="checkbox" /> Щось <HelpButton id="setting.streak" /></label>);
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Серії' }));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    screen.getByRole('dialog', { name: 'Серії' });
  });
  ```
  (`buff.*` і `setting.streak` — із задачі 2, яка йде раніше.)
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/help`. Очікується FAIL: немає `HelpButton`.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/help apps/web/src/i18n.ts apps/web/src/styles.css
  git commit -m "feat(web): ⓘ button with a non-modal help window (a bottom sheet on phones) — what it is, how it goes, points, tip, limits, a link to the reference; Escape, outside tap, one at a time"
  ```

---

### Задача 4. Довідник `/help`: теми, пошук, якорі й посилання зі списку вікторин

**Files:**
- Create: `apps/web/src/pages/HostHelp.tsx`
- Create: `apps/web/src/pages/HostHelp.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx`, `apps/web/src/AppRoutes.test.tsx`
- Modify: `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `HostHelp` (маршрут `/help` усередині `<Route element={<WithMenu />}>`, без входу в акаунт):
  ```tsx
  <main className="app wide host-help">
    <h1 className="brand">{t('helpTitle')}</h1>
    <p className="lead">{t('helpLead')}</p>
    <label className="field help-search"><span>{t('helpSearch')}</span><input type="search" value={query} onChange=… /></label>
    {found.length === 0 && <p className="meta">{t('helpNothing')}</p>}
    {HELP_TOPICS.map((topic) => /* лише теми з записами серед found */ (
      <section key={topic} aria-labelledby={`help-topic-${topic}`}>
        <h2 id={`help-topic-${topic}`}>{t(`helpTopic_${topic}`)}</h2>
        {ids.map((id) => (
          <article key={id} id={helpAnchor(id)} className={id === target ? 'panel help-entry is-target' : 'panel help-entry'} aria-labelledby={`${helpAnchor(id)}-title`}>
            <h3 id={`${helpAnchor(id)}-title`}>{icon(id)} {helpEntry(id).title}</h3>
            <HelpBody entry={helpEntry(id)} level={4} />
          </article>
        ))}
      </section>
    ))}
  </main>
  ```
  - `found = searchHelp(query)`; групування — за `helpTopic`, порядок лишається порядком `searchHelp`.
  - `icon(id)` бере значок з `ROUND_ICONS`, `TYPE_ICONS`, `BUFF_ICONS` чи `DEBUFF_ICONS`, а клітинкам і налаштуванням значок не потрібен. Значок у `<span aria-hidden="true">`.
  - Якір: `const { hash } = useLocation()`. Ефект на `hash`: знайти запис з `helpAnchor(id) === hash.slice(1)`, позначити його `target` і викликати `document.getElementById(...)?.scrollIntoView({ block: 'start' })`. Під час пошуку `target` не скидається.
  - `document.title` не змінюємо (у застосунку так ніде не роблять).
- `Quizzes.tsx`: у `.toolbar` після «Додати приклад» — `<Link className="btn" to="/help">{t('helpLink')}</Link>`.
- styles.css: `.host-help section + section { margin-top: 2rem }`; `.help-entry { margin-top: 0.75rem }`; `.help-entry h4` — як `.help-pop h3`; `.help-entry.is-target { outline: 2px solid var(--accent, currentColor); outline-offset: 2px }` (взяти наявний акцентний токен файлу). `scroll-margin-top: 1rem` для `.help-entry`. На 375 px — без горизонтальної прокрутки (довгі слова переносяться: `overflow-wrap: anywhere` для `.help-entry`).

- [ ] **Step 1: Write the failing tests.**
  - `HostHelp.test.tsx` (`// @vitest-environment jsdom`; рендер у `<MemoryRouter initialEntries={['/help']}>`; `Element.prototype.scrollIntoView = vi.fn()` у `beforeEach`):
    ```tsx
    it('groups every entry by topic in order; teams stay hidden while empty', () => {
      renderAt('/help');
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Раунди', 'Типи запитань', 'Клітинки поля', 'Бафи', 'Дебафи', 'Налаштування']);
      for (const id of HELP_TOPICS.flatMap(helpIds)) expect(document.getElementById(helpAnchor(id))).not.toBeNull();
      const swap = document.getElementById('help-buff-swap')!;
      within(swap).getByRole('heading', { level: 3, name: /Заміна запитання/ });
      within(swap).getByRole('heading', { level: 4, name: 'Як іде в грі' });
    });
    it('searches by name and says when nothing is found', () => {
      renderAt('/help');
      fireEvent.change(screen.getByLabelText('Пошук за назвою'), { target: { value: 'щит' } });
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.trim())).toEqual(['🛡 Щит']);
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Бафи']);
      fireEvent.change(screen.getByLabelText('Пошук за назвою'), { target: { value: 'зззз' } });
      screen.getByText('Нічого не знайдено.');
      expect(screen.queryAllByRole('heading', { level: 2 })).toEqual([]);
    });
    it('an anchor highlights and scrolls to its entry', () => {
      renderAt('/help#help-cell-marks');
      const marks = document.getElementById('help-cell-marks')!;
      expect(marks.classList.contains('is-target')).toBe(true);
      expect(marks.scrollIntoView).toHaveBeenCalled();
    });
    ```
  - `AppRoutes.test.tsx`: додати `'/help'` до списку сторінок із меню (`vi.mock('./pages/HostHelp', () => ({ HostHelp: () => <p>HostHelp</p> }))`). Окремий тест: `/help` без акаунта рендерить `HostHelp`.
  - `Quizzes.test.tsx`: є посилання «Довідка ведучого» з `href="/help"`. Узяти наявну підготовку списку вікторин у файлі.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages apps/web/src/AppRoutes.test.tsx`. Очікується FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/pages apps/web/src/AppRoutes.tsx apps/web/src/AppRoutes.test.tsx apps/web/src/styles.css
  git commit -m "feat(web): the host reference at /help — every entry grouped by topic, search by name, #anchors that highlight an entry; a link from the quiz list"
  ```

---

### Задача 5. «ⓘ» у редакторі й посилання на довідник

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx` (посилання; «ⓘ» у «Правилах гри», «Запасних запитаннях», «Дуелях»)
- Modify: `apps/web/src/editor/RoundStrip.tsx` (вибір типу раунду)
- Modify: `apps/web/src/editor/RoundSettings.tsx` (тип раунду, бали за швидкість, правила)
- Modify: `apps/web/src/editor/QuestionEditor.tsx` (тип запитання)
- Modify: `apps/web/src/editor/BoardEditor.tsx` (позначка, тип клітинки, спосіб відповіді, штраф бліцу, запасні категорії)
- Modify: `apps/web/src/editor/PowersEditor.tsx` (кожен баф і дебаф, крамниця)
- Modify: `apps/web/src/editor/QuizEditor.test.tsx`, `BoardEditor.test.tsx`, `PowersEditor.test.tsx`
- Modify: `apps/web/src/styles.css` (за потреби — дрібні відступи)

**Interfaces:**
- Consumes: `HelpButton` (задача 3), `cellHelpId` не потрібен (у редакторі id вибирається явно).
- Розміщення — кожна «ⓘ» поза `<label>`, в обгортці `.with-help` (див. задачу 3):
  - `QuizEditor`:
    - під `<h1>` — `<a className="quiet-link help-link" href="/help" target="_blank" rel="noreferrer">{t('helpLink')}<span aria-hidden="true"> ↗</span></a>`;
    - у «Правилах гри» — `.with-help` навколо поля «Показувати рейтинг» з `HelpButton id="setting.leaderboard"`, і навколо прапорця «Пояснення для новачків» з `setting.newcomers`;
    - у `details.spares` першим рядком — `<p className="meta with-help"><span>{t('sparesTitle')}</span><HelpButton id="setting.spares" /></p>`; у `details.duels` так само: `<span>{t('duelsTitle')}</span>` і `setting.duels`.
  - `RoundStrip`: у режимі вибору кожна кнопка типу йде в `<span className="with-help">` з `HelpButton id={`round.${type}`}`. Чотири кнопки будувати з `ROUND_TYPES` і `ROUND_NAMES` замість чотирьох копій — так нові раунди 10g–10i з'являться в рядку самі.
  - `RoundSettings`: першим рядком у `<details>` (після `<summary>`) — `<p className="meta with-help"><span>{t(ROUND_NAMES[round.type])}</span><HelpButton id={`round.${round.type}`} /></p>`; біля `speedBonus` — `setting.speedBonus`; біля «Штраф…» — `setting.penalty`; біля «Кнопка «частково»» — `setting.partial`; біля «Серії…» — `setting.streak`; біля «Множник балів» — `setting.multiplier`.
  - `QuestionEditor`: одразу після `<div className="type-chips">` (у тому самому рядку, обгортка `.with-help`) — `HelpButton id={`question.${question.type}`}`.
  - `BoardEditor` (панель клітинки): біля «Позначки» — `cell.marks`; біля «Типу клітинки» — `cell.${current.kind}`; біля «Як відповідати» — `cell.voice`; біля «Штрафу бліцу» — `cell.blitz`. У заголовку `<h3>` запасних категорії — `HelpButton id="setting.spares"`.
  - `PowersEditor`: у кожному `.powers-row` дебафу після `label.powers-item` — `HelpButton id={`debuff.${kind}`}`. Кожен баф — у `<div className="powers-row">` з `HelpButton id={`buff.${kind}`}` після `label`. Біля прапорця «Гравці можуть купувати дебафи» — `setting.debuffShop`.
- Ні одна «ⓘ» не викликає `onChange`/`update`.

- [ ] **Step 1: Write the failing tests.**
  - `QuizEditor.test.tsx`:
    ```tsx
    it('ⓘ next to the settings, spares, duels and the reference link — reading help does not change the quiz', () => {
      const onDraft = vi.fn();
      renderEditor({ onDraft }); // наявний помічник файлу; якщо його немає — render(<QuizEditor initial={…} heading="…" onDraft={onDraft} onSave={…} onCancel={…} />)
      const link = screen.getByRole('link', { name: 'Довідка ведучого' });
      expect(link.getAttribute('href')).toBe('/help');
      expect(link.getAttribute('target')).toBe('_blank');
      for (const name of ['Показувати рейтинг', 'Пояснення для новачків', 'Запасні запитання', 'Дуелі', 'Крамниця дебафів', 'Щит', 'Туман']) {
        fireEvent.click(screen.getByRole('button', { name: `Довідка: ${name}` }));
        screen.getByRole('dialog', { name });
      }
      expect(onDraft).not.toHaveBeenCalled();
    });
    it('round types: ⓘ for each kind in «+ Раунд» and for the current round in its settings', () => {
      renderEditor();
      fireEvent.click(screen.getByRole('button', { name: '+ Раунд' }));
      for (const name of ['Класичний', 'Бліц', 'Ігрове поле', 'Фінал']) screen.getAllByRole('button', { name: `Довідка: ${name}` });
      const settings = document.querySelector('details.round-settings') as HTMLElement;
      within(settings).getByRole('button', { name: 'Довідка: Класичний' });
      for (const name of ['Бали за швидкість', 'Штраф «мінус»', 'Кнопка «частково»', 'Серії', 'Множник балів']) within(settings).getByRole('button', { name: `Довідка: ${name}` });
    });
    it('the question ⓘ follows the chosen type', () => {
      renderEditor();
      screen.getByRole('button', { name: 'Довідка: Один правильний варіант' });
      fireEvent.click(screen.getByRole('button', { name: 'число' }));
      fireEvent.click(screen.getByRole('button', { name: 'Довідка: Число' }));
      screen.getByRole('dialog', { name: 'Число' });
    });
    it('the ⓘ does not toggle the newcomers checkbox', () => { /* натиснути «Довідка: Пояснення для новачків» → прапорець «Пояснення для новачків» не позначений */ });
    ```
  - `BoardEditor.test.tsx`:
    ```tsx
    it('a cell has ⓘ for marks, its kind and voice; the kind ⓘ follows the select; spares of a category have ⓘ', () => {
      // наявна підготовка поля з трьох категорій
      screen.getByRole('button', { name: 'Довідка: ×2 і ×3' });
      screen.getByRole('button', { name: 'Довідка: Звичайна клітинка' });
      screen.getByRole('button', { name: 'Довідка: Відповідь уголос' });
      fireEvent.change(screen.getByLabelText('Тип клітинки'), { target: { value: 'blitz' } });
      // onChange — vi.fn(): перерендерити з оновленим round (rerender), далі:
      screen.getAllByRole('button', { name: 'Довідка: Бліц-клітинка' }); // біля типу й біля штрафу
      within(screen.getByRole('region', { name: /^Запасні категорії/ })).getByRole('button', { name: 'Довідка: Запасні запитання' });
    });
    ```
  - `PowersEditor.test.tsx`: `it('every buff and debuff row and the shop have ⓘ', …)` — для кожного `BUFF_KINDS`/`DEBUFF_KINDS` є `Довідка: ${buffName(kind)}` / `Довідка: ${debuffName(kind)}`, а також «Довідка: Крамниця дебафів». Клік по «ⓘ» бафу не викликає `onChange`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor`. Очікується FAIL: «ⓘ» немає.
- [ ] **Step 3: Implement** за Interfaces. Звірити на 375 px: рядок чипів з «ⓘ» переноситься (`.type-chips` уже `flex-wrap`), рядки бафів не вилазять за край.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS. Наявні тести, що рахували кнопки, звузити за назвою (див. «Порядок збирання»).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/editor apps/web/src/styles.css
  git commit -m "feat(web): ⓘ in the editor — round types, question type, cell kinds, every buff and debuff, the debuff shop, leaderboard, newcomers, speed bonus, spares, duels and round rules; a link to the host reference"
  ```

---

### Задача 6. «ⓘ» на пульті ведучого: раунд, тип запитання, клітинка; посилання на довідник

**Files:**
- Modify: `apps/web/src/screens/HostScreen.tsx`
- Modify: `apps/web/src/screens/HostScreen.test.tsx`
- Modify: `apps/web/src/styles.css` (`.host-context`)

**Interfaces:**
- Consumes: `HelpButton` (задача 3), `cellHelpId` (задача 1), `roundLabel` (`../format`).
- Заставка раунду: у `phase === 'intro' && round !== null` поруч із `<h1 className="question">` — `HelpButton id={`round.${round.type}`}`. `h1` і кнопка — в обгортці `.with-help`; `h1` лишається заголовком, кнопка йде поза ним.
- Рядок контексту: на початку секції запитання (`view.question !== null && phase !== 'finished'`), перед рядком клітинки:
  ```tsx
  {round !== null && (
    <p className="meta host-context">
      <span>{roundLabel(round.title, round.index, round.type)}</span>
      <HelpButton id={`round.${round.type}`} />
      <span aria-hidden="true"> · </span>
      <span>{t(`type_${view.question.type}`)}</span>
      <HelpButton id={`question.${view.question.type}`} />
    </p>
  )}
  ```
  Рядок клітинки (`cellTitle`) отримує в кінці `HelpButton id={cellHelpId(board.cell)}`.
- На етапі `board` (вибір клітинки) у секції поля перед `boardChooser` — той самий рядок, але лише з раундом.
- `nav.links`: після «Відкрити сцену» — `<a href="/help" target="_blank" rel="noreferrer">{t('helpLink')}</a>`.
- `.host-context` — `display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem`.
- Пульт нічого не надсилає на відкриття, закриття чи читання довідки, а головна кнопка лишається доступною з відкритим вікном.

- [ ] **Step 1: Write the failing tests** у `HostScreen.test.tsx` (фабрика `view()` і `publicOf` уже є):
  ```tsx
  const classicRound: RoundInfo = { …наявний зразок RoundInfo у файлі…, type: 'classic', title: 'Розминка', index: 0, total: 2 };

  it('during a question the round and the question type have ⓘ; help sends nothing and the main button still works', () => {
    const send = vi.fn() as unknown as Send;
    render(<HostScreen view={view({ phase: 'question', round: classicRound, questionIndex: 0, question: publicOf(single), endsAt: Date.now() + 20_000 })} code="123456" stageUrl="/stage/123456" joinUrl="/play/123456" send={send} />);
    const line = document.querySelector('.host-context') as HTMLElement;
    expect(line.textContent).toContain('Розминка');
    expect(line.textContent).toContain('Один правильний варіант');
    fireEvent.click(within(line).getByRole('button', { name: 'Довідка: Один правильний варіант' }));
    screen.getByRole('dialog', { name: 'Один правильний варіант' });
    expect(send).not.toHaveBeenCalled();
    const lock = screen.getByRole('button', { name: 'Закрити запитання' });
    fireEvent.pointerDown(lock);
    fireEvent.click(lock);
    expect(send).toHaveBeenCalledWith('host:lock', expect.anything(), expect.anything()); // підлаштувати під наявний підпис Send у файлі
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('the round intro has ⓘ next to its title', () => { /* phase 'intro', round classicRound → кнопка «Довідка: Класичний» */ });
  it('a board cell shows ⓘ of its kind', () => { /* phase 'question', round type 'board', board.cell { kind: 'blitz', answerMode: 'phone', mark: 'none', … } → «Довідка: Бліц-клітинка»; cell normal+voice → «Довідка: Відповідь уголос» */ });
  it('links to the host reference in a new tab', () => {
    // будь-який етап
    const link = screen.getByRole('link', { name: 'Довідка ведучого' });
    expect(link.getAttribute('href')).toBe('/help');
    expect(link.getAttribute('target')).toBe('_blank');
  });
  ```
  (Для поля взяти наявну в файлі фабрику `HostBoard`/`board` з тестів поля. Якщо її немає, зібрати мінімальний `board` з полями `BoardInfo` + `manual`, `answer`.)
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/HostScreen.test.tsx`. Очікується FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src/screens apps/web/src/styles.css
  git commit -m "feat(web): ⓘ on the host console — the current round, the question type and the board cell; help never pauses or sends anything; a link to the host reference"
  ```

---

### Задача 7. Наскрізний сценарій: «ⓘ» у редакторі, довідник і пульт на кадрах

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–6. Помічники: `open`, `register`, `join`, `click`, `shot`, `expectNoSideScroll`, `afterSplash`, `seconds`, `exact`, `snapshot`, `problems`. Фікстури: `classicRound`, `boardRound`, `makeRoundsQuiz`, `withId`, `withPoints`, `single`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 9d:
  ```ts
  it('part 10a: host help — ⓘ in the editor for a setting, a buff, a blitz cell and a round type, a bottom sheet on a phone, reading help leaves the quiz unchanged; the reference with topics, search and an anchor; ⓘ on the host console that never stops the game', async () => {
    try {
      await hostHelpGame();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  Підготовка `hostHelpGame()`:
  1. `const host = await open('host10a', 1280, 900); await register(host, 'host', 'Олег Ведучий', 'host10a@example.com');`
  2. Вікторина «Довідка 10a» через `host.request.post(`${base}/api/quizzes`)`:
     - класичний раунд `r1` «Розминка» (`speedBonus: true`): single «Столиця України?» — «Київ» (правильний), «Львів», «Одеса», 30 с, 100 балів;
     - поле `r2` «Поле» (`answerMode: 'phone'`, `check: 'auto'`): категорії «Міста», «Річки», «Гори», клітинки 100/200/300 «{категорія} {ціна}: столиця України?». («Міста», 100) — `{ kind: 'blitz', question }`, («Річки», 100) — `{ answerMode: 'voice', question }`, («Гори», 300) — `{ mark: 'x2', question }`;
     - `spares`: `g1` text «Яке місто стоїть на Пруті?» (`accepted: ['Чернівці']`);
     - `settings`: `leaderboard: 'end'`, `buffs: [...всі вісім]`.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Список вікторин.** `host.goto(`${base}/quizzes`)` → посилання «Довідка ведучого» з `href="/help"`.
  2. **Редактор (1280 × 900).** «Редагувати» у «Довідка 10a» → посилання «Довідка ведучого» має `target="_blank"` (не клікати).
     - `details.rules` (перший) → `summary` → «Довідка: Показувати рейтинг» → `dialog` «Показувати рейтинг» з текстом «Лише в кінці гри» (`getByText(/Лише в кінці гри/)`) → кадр `help10a-editor-setting` → `Escape` → вікна немає, фокус на «ⓘ» (`expect(await host.evaluate("document.activeElement?.getAttribute('aria-label')")).toBe('Довідка: Показувати рейтинг')`).
     - `details.powers > summary` → «Довідка: Заміна запитання» → у вікні заголовки «Що це», «Як іде в грі», «Бали», «Порада», «Обмеження»; посилання «Усі пояснення» з `href="/help#help-buff-swap"` → кадр `help10a-editor-buff` → `Escape`.
     - Вкладка раунду «Поле» → клітинка `/^Категорія 1, клітинка 1: 100 бліц/` → «Довідка: Бліц-клітинка» (перша) → вікно з «Мінус для всіх» → кадр `help10a-editor-cell` → `Escape`.
     - «+ Раунд» → «Довідка: Фінал» → вікно «Фінал» → кадр `help10a-editor-round` → кнопка «Закрити».
     - `host.setViewportSize({ width: 375, height: 812 })` → вкладка «Розминка» → «Довідка: Один правильний варіант». Вікно — аркуш знизу: `boundingBox` має `x === 0`, `width === 375`, `y + height` у межах 1 px від 812 → кадр `help10a-editor-sheet-375` → `expectNoSideScroll(host, 'help10a-editor-375')` → `Escape` → назад 1280 × 900.
     - «Скасувати» → `host.waitForURL(/\/quizzes$/)`. Довідка не позначила вікторину зміненою, тож підтвердження не було: за наявного `confirm` Playwright відхилив би діалог, і сторінка лишилася б у редакторі.
  3. **Довідник.** `host.goto(`${base}/help`)`:
     - `h1` «Довідка ведучого»; заголовки `h2` = `['Раунди', 'Типи запитань', 'Клітинки поля', 'Бафи', 'Дебафи', 'Налаштування']`; кадр `help10a-reference`;
     - «Пошук за назвою» ← «щит» → видимі `h3` — лише «🛡 Щит» → кадр `help10a-reference-search`; ← «зззз» → «Нічого не знайдено.»; очистити;
     - `host.goto(`${base}/help#help-buff-swap`)` → `article#help-buff-swap` має клас `is-target` і у вьюпорті (`toBeInViewport` або `boundingBox().y < 900`);
     - 375 × 812 → кадр `help10a-reference-375`, `expectNoSideScroll(host, 'help10a-reference-375')` → назад 1280 × 900.
  4. **Пульт.**
     - `host.goto(`${base}/quizzes`)` → «Грати» у «Довідка 10a» → `waitForURL(/\/host\/\d{6}$/)`. Посилання «Довідка ведучого» на пульті має `href="/help"` і `target="_blank"`.
     - `const olya = await open('olya10a', 375, 812); await join(olya, code, 'Оля', false);` → «Почати гру» → `afterSplash(host, olya)` → на заставці кнопка «Довідка: Класичний» → «Почати раунд» → `afterSplash(host, olya)`.
     - `.host-context` містить «Розминка» й «Один правильний варіант» → «Довідка: Один правильний варіант» → вікно → кадр `help10a-host-popover`.
     - Гра не стоїть: `const before = await seconds(host); await host.waitForTimeout(1500); expect(await seconds(host)).toBeLessThan(before);`. Банера «Пауза» немає.
     - З відкритим вікном Оля торкається «Київ» → на пульті `getByText('Запитання закрите')` (автозакриття після відповіді всіх) → «Показати відповідь» → вікна немає, на пульті «Правильна відповідь: Київ» → кадр `help10a-host-reveal`.
  5. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Наявні сценарії шукають кнопки за назвою, тож нові «ⓘ» їх не ламають. Якщо якийсь сценарій бере `getByRole('button', { name: 'Бліц' })` без `exact` і тепер ловить і «Довідка: Бліц», додати `exact`. Потім той самий запуск з `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` і перегляд кадрів у `apps/server/e2e/artifacts/shots`:
  - вікно на 1280 px не накриває футер із «Зберегти»;
  - аркуш на 375 px читається, кнопка «Закрити» видна;
  - довідник читається на 375 px;
  - на пульті рядок контексту не ламає верстку запитання.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e/full-game.e2e.ts
  git commit -m "test: part 10a end-to-end — ⓘ in the editor (setting, buff, blitz cell, round type, phone sheet) without dirtying the quiz, the reference with topics, search and an anchor, ⓘ on the host console while the timer keeps running"
  ```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Формат стану гри не змінився — пуш ігор, що йдуть, не перериває.

У звіті власникові назвати рішення:
- «ⓘ» стоїть біля кожного типу раунду, типу запитання (одна кнопка для вибраного типу), виду клітинки, бафу, дебафу й важливих налаштувань, зокрема правил раунду;
- вікно немодальне й гру не зупиняє, на телефоні це аркуш знизу;
- довідник `/help` з пошуком за назвою; посилання на нього є в редакторі (нова вкладка), у списку вікторин і на пульті (нова вкладка);
- «дуель» — запис у «Налаштуваннях», бо в коді це не клітинка;
- тема «Команди» з'явиться в 10j;
- тексти гравців не змінювалися, а тести звіряють назви й числа між двома наборами.
