# План 6h: нікнейм з імені, верх редактора й пояснення раундів

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** три правки після реальної гри.
1. Нікнейм за замовчуванням береться лише з імені, а не з повного імені й прізвища.
2. Назва вікторини й «Правила гри» стоять у редакторі на самому верху.
3. Гравці бачать на заставці раунду, як він рахує бали: коротке пояснення генерується з налаштувань раунду, а автор може дописати свій опис.

**Архітектура:**
- **Нікнейм (`server`).** `baseNickname` у `apps/server/src/profiles.ts` бере перше слово імені акаунта. Якщо воно не проходить `nicknameSchema` (наприклад, одна літера), береться повне ім'я, як зараз, а якщо й воно не проходить, то `DEFAULT_NICKNAME`. Унікальність із « 2», « 3» не змінюється.
- **Наявні профілі (`server`, міграція `0005`).** Міграція видаляє профілі, яких власник жодного разу не зберігав (`updated_at = created_at` і `avatar IS NULL`). Наступне читання створить такий профіль знову через `ensureProfile`, уже з ім'ям. Чому це надійно:
  - профіль створює лише `ensureProfile` (insert з типовими `created_at` і `updated_at`; обидва `DEFAULT now()` в одному запиті мають однакове значення);
  - змінює профіль лише `saveProfile`, і він завжди ставить `updatedAt: new Date()`. Збереження з аватаром чи навіть з тим самим нікнеймом робить `updated_at` іншим;
  - `follow` посилається на `user`, а не на `profile`. Видалення профілю не чіпає друзів. Статистику й ачівки рахують з ігор, а не з профілю.
  Профіль, який власник зберіг (навіть із повним ім'ям), лишається як є.
- **Опис раунду (`shared`).** Кожен із чотирьох типів раунду отримує поле `description: string` (до 200 символів, `.optional()`). Старі вікторини й чернетки без поля проходять перевірку. Обрано `.optional()`, а не `.default('')`: інакше тип `Round` вимагав би поле в ~30 літералах раундів у тестах і скриптах. Читачі пишуть `round.description ?? ''`.
- **Зведення правил (`shared`).** Нова чиста функція `roundBrief(round): RoundBrief` у `packages/shared/src/round-brief.ts` повертає пласку структуру з налаштувань, що впливають на бали: штраф, серії, множник, бонус за швидкість, спроби й вікно бліцу, позначки, бліц-клітинки й способи відповіді поля. Текстів у ній немає.
- **Зрізи (`engine`).** `RoundInfo` отримує `description: string` і `brief: RoundBrief`. Їх бачать усі ролі. Запитань і відповідей у них немає, тож спойлерів теж.
- **Тексти (`web`).** `roundSummary(brief): string[]` у `apps/web/src/round-summary.ts` складає з `RoundBrief` від 2 до 4 рядків через `t()`. Компонент `RoundBriefing` показує опис автора й ці рядки. Він стоїть:
  - на заставці раунду (`phase === 'intro'`) на сцені, у телефоні й на пульті, також у фіналі;
  - у редакторі, в кінці «Налаштувань раунду», як попередній перегляд.

**Технології:** TypeScript, zod 4, vitest, Fastify, Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація** (окремого документа немає; обов'язкові вимоги власника від 2026-10-23, після реальної гри):
1. **Нікнейм профілю за замовчуванням — лише ім'я.** Зараз нікнейм за замовчуванням береться з `user.name` (для входу через Google це повне справжнє ім'я), див. `apps/server/src/profiles.ts` (нікнейм за замовчуванням, унікальність із « 2», « 3»…). Брати лише перше слово імені (обрізане; якщо порожньо — поточна поведінка або розумне значення; як і раніше 2–20 символів і унікальність). Вирішити, що робити з профілями, уже створеними в продакшені з повним ім'ям за замовчуванням (рядок профілю створюється ліниво під час першого читання; функцію випущено 2026-10-22, тож таких небагато): запропонувати безпечний підхід (наприклад, разову міграцію, що скорочує нікнейм лише там, де він досі дорівнює старому значенню за замовчуванням і користувач його не змінював, — лише якщо це надійно визначається; інакше лишити й так і сказати).
2. **Розкладка редактора вікторини:** «Назва вікторини» і «Правила гри» (короткий опис, налаштування рейтингу) мають бути на самому верху, перед налаштуваннями раунду й раундами. Назва й правила — перше, що видно, і на комп'ютері, і на телефоні.
3. **Опис раундів:** гравці не зрозуміли, як рахує бали бліц. Додати (а) автоматичне пояснення правил кожного раунду простою мовою, згенероване з типу й налаштувань раунду (наприклад, бліц: «Бали отримує той, хто першим правильно відповість», спроби / вікно відповіді / штраф; класичний: відповідають усі, бонус за швидкість, штраф, серії, множник; поле: вибір клітинки, ×2/×3, бліц-клітинки, голос/телефон; фінал: таємна ставка тощо), і (б) необов'язкове поле опису раунду від автора в налаштуваннях раунду. Показувати обидва там, де гравці бачать початок раунду (заставка раунду на телефоні, сцені й пульті). Пояснення коротке (2–4 рядки), читається на телевізорі й на телефоні 360 px. Редактор показує згенероване пояснення під налаштуваннями раунду.

**Рішення плану там, де вимоги мовчать:**
- **Перше слово** — частина до першого пробілу після стискання пробілів. Дефіс слова не ділить: «Анна-Марія Коваль» дає «Анна-Марія». Довше за 20 символів перше слово обрізається до 20, як і зараз повне ім'я.
- **Профілі в продакшені** видаляються міграцією лише тоді, коли їх не зберігали (див. «Архітектура»). Наслідки, які приймаємо:
  - пошук друга за старим повним нікнеймом перестане знаходити людину, поки вона не відкриє профіль або хтось не відкриє її сторінку; після цього працює новий нікнейм;
  - якщо нове ім'я вже зайняте, людина отримає «Олена 2». Це звичайне правило унікальності.
- **Де показується пояснення.** Заставка `intro` вже є перед кожним раундом вікторини з кількома раундами, а також перед полем і фіналом завжди (`start` і `next` з `round_end` у `packages/engine/src/game.ts`). Тож нового етапу не потрібно: пояснення додається на наявну заставку. Ведучий тримає її скільки треба й читає пояснення вголос з пульта.
  - **Виняток:** вікторина з одним класичним або бліц-раундом починається одразу з запитання, без заставки. Це лишається як є. Додати їй заставку означає змінити `start` і переписати близько 13 наявних тестів рушія й сервера та бліц-сценарій e2e, які очікують відкрите запитання одразу після старту. Реальні ігри й демо мають кілька раундів. Окремим рішенням власника це можна змінити пізніше (див. звіт).
- **Порядок на заставці:** номер і назва раунду, далі опис автора (якщо є), далі рядки пояснення. Опис автора стоїть вище, бо зазвичай це тема раунду. На сцені у фіналі пояснення стоїть під темою лише на `intro`, на етапі ставок його немає.
- **Позначки поля.** Пояснення каже лише, що клітинки ×2/×3 є. Які саме, не видно, тож сюрприз лишається.
- **Попередній перегляд** у редакторі стоїть у кінці згорнутих «Налаштувань раунду»: правила раунду змінюють саме там, і на телефоні над запитанням не з'являється зайвий блок.
- **Верх редактора:** нова секція `editor-quiz` з полем «Назва вікторини» і згорнутими «Правилами гри» стоїть одразу під заголовком сторінки й повідомленням, перед смугою раундів. Ліва колонка містить лише список запитань. Секція займає всю ширину й однакова на комп'ютері й на телефоні.
- **Демо-вікторини** не змінюються: пояснення генерується саме, опис автора необов'язковий.

## Глобальні обмеження

- Гра, бали, етапи й історія поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних:
  - очікування нікнейма «Олена Петренко» в `profiles.test.ts` стає «Олена»;
  - літерали `RoundInfo` у `apps/web/src/screens/*.test.tsx` отримують `description: ''` і `brief: emptyBrief(<тип>)`.
- Рушій чистий: без мережі, бази й таймерів.
- Значення:
  - нікнейм від 2 до 20 символів, унікальний (`nicknameSchema`, `nicknameKey`);
  - опис раунду до 200 символів (`LIMITS.roundDescription = 200`);
  - пояснення раунду має від 2 до 4 рядків.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Кольори лише через наявні токени `styles.css` (`--paper`, `--dim`, `--amber`, `--line`). Тема лише темна. Нові класи мають префікси `round-brief` і `editor-quiz` і не перевизначають наявних.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри для перевірки дизайну знімаються з `E2E_SHOTS=1`.
- Одна міграція бази: `0005_short_default_nicknames` (лише дані, схема не змінюється). Сервер застосовує її під час запуску.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

- Задача 1 (нікнейм і міграція) незалежна від решти.
- Задача 2 додає `description`, `RoundBrief`, `roundBrief`, `emptyBrief` і `RoundInfo.description` / `RoundInfo.brief`. У тій самій задачі механічно оновлюються літерали `RoundInfo` у `apps/web/src/screens/*.test.tsx`, щоб `pnpm typecheck` лишався зеленим.
- Задача 3 (тексти й показ на заставці) спирається на задачу 2. Задача 4 (редактор) спирається на задачі 2 і 3 (`RoundBriefing`).
- Задача 5 (наскрізні сценарії) іде останньою. Наявні сценарії мають лишатися зеленими після кожної задачі.

## На що дивитися рецензентові

1. **Ім'я, з якого не виходить нікнейм.** «Я Петро» (перше слово з однієї літери) дає «Я Петро». Ім'я з самих пробілів або «Я» дає «Гравець». Ім'я з кількома пробілами поспіль і пробілами по краях дає чисте перше слово. Тест: задача 1, `falls back to the whole name when the first word is too short`.
2. **Міграція не чіпає профіль, який людина зберегла.** Збережений повний нікнейм і профіль з аватаром лишаються, а друзі незбереженого профілю не губляться. Тест: задача 1, `migration 0005 recreates only profiles nobody saved`.
3. **Стара вікторина без опису й без нових полів.** Вона проходить `quizSchema`, на заставці показує лише пояснення без порожнього абзацу опису, а в редакторі поле опису порожнє. Тести: задача 2, `a round may carry a description and old rounds without one still parse`; задача 3, `the intro shows the rules summary without an empty note`.
4. **Найдовше пояснення.** Поле з усіма опціями (телефон і голос, позначки, бліц-клітинки зі штрафом для всіх, штраф, серія, множник) дає не більше 4 рядків. На телефоні 360 px і на сцені немає горизонтальної прокрутки. Тести: задача 3, `never takes more than four lines`; задача 5, `expectNoSideScroll` на телефоні 360 px.
5. **Опис автора з довгим словом або 200 символами** переноситься на телефоні 360 px і не розпирає сцену (`overflow-wrap: anywhere`). Тест: задача 5, опис з довгим словом без пробілів, `expectNoSideScroll(taras, 'round-brief-phone-360')` і кадр `round-brief-stage`.

---

### Задача 1. Нікнейм з імені й міграція незбережених профілів

**Files:**
- Modify: `apps/server/src/profiles.ts` (`baseNickname`)
- Create: `apps/server/drizzle/0005_short_default_nicknames.sql`, оновлюються `apps/server/drizzle/meta/_journal.json` і `meta/0005_snapshot.json` (генерує drizzle-kit)
- Test: `apps/server/src/profiles.test.ts`, `apps/server/src/db/schema.test.ts`

**Interfaces:**
- Produces: поведінка `ensureProfile` змінюється лише в основі нікнейма; сигнатури ті самі.

- [ ] **Step 1: Write the failing tests** у `profiles.test.ts`, `describe('default nickname')`. Наявний тест `makes a default nickname from the account name` перейменувати й змінити очікування:

```ts
it('makes a default nickname from the first name of the account', async () => {
  const db = await createTestDb();
  await addUser(db, 'u1', 'Олена Петренко');
  await addUser(db, 'u2', '  Олена   Коваль ');
  await addUser(db, 'u3', 'Анна-Марія Шевченко');

  expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена', avatar: null });
  expect(await ensureProfile(db, 'u1')).toEqual({ id: 'u1', nickname: 'Олена', avatar: null });
  expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Олена 2');
  expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Анна-Марія');
  expect(await db.select().from(profile)).toHaveLength(3);
});

it('falls back to the whole name when the first word is too short', async () => {
  const db = await createTestDb();
  await addUser(db, 'u1', 'Я Петро');
  await addUser(db, 'u2', '   ');

  expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Я Петро');
  expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Гравець');
});
```

  Наявний тест `fits a long name…` не змінюється: «Олександра-Анастасія Ш» уже дає перше слово.

  У `schema.test.ts`, `describe('profiles schema (migration 0004)')` або новий `describe('short default nicknames (migration 0005)')`:

```ts
it('migration 0005 recreates only profiles nobody saved', async () => {
  const { follow, profile } = await import('./schema');
  const { ensureProfile, nicknameKey } = await import('../profiles');
  const { db, migrateRest } = await createTestDbUpTo('0004_profiles');
  for (const [id, name] of [['u1', 'Олена Петренко'], ['u2', 'Тарас Шевченко'], ['u3', 'Віра Коваль']]) {
    await db.insert(user).values({ id, name, email: `${id}@example.com` });
  }
  const row = (userId: string, nickname: string) => ({ userId, nickname, nicknameKey: nicknameKey(nickname) });
  // u1 — створений за старим правилом і не збережений; u2 — збережений з тим самим повним ім'ям; u3 — з аватаром.
  await db.insert(profile).values([row('u1', 'Олена Петренко'), row('u2', 'Тарас Шевченко'), row('u3', 'Віра Коваль')]);
  await db.update(profile).set({ updatedAt: new Date(Date.now() + 1000) }).where(eq(profile.userId, 'u2'));
  await db.update(profile).set({ avatar: '/uploads/abcdefabcdefabcd.png' }).where(eq(profile.userId, 'u3'));
  await db.insert(follow).values({ followerId: 'u2', followeeId: 'u1' });

  await migrateRest();

  expect((await ensureProfile(db, 'u1'))?.nickname).toBe('Олена');
  expect((await ensureProfile(db, 'u2'))?.nickname).toBe('Тарас Шевченко');
  expect((await ensureProfile(db, 'u3'))?.nickname).toBe('Віра Коваль');
  expect(await db.select().from(follow)).toHaveLength(1);
});
```

  Примітка: оновлення `u3` через `db.update` без `updatedAt` лишає `updated_at = created_at`, тому цей рядок перевіряє саме умову `avatar IS NULL`. Наявний тест `the profiles migration applies over an existing database` (рядок з ім'ям «Олена») не змінюється.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/profiles.test.ts apps/server/src/db/schema.test.ts`. Очікується FAIL: «Олена Петренко» замість «Олена» і `unknown migration` / рядок u1 не змінено.

- [ ] **Step 3: Implement `baseNickname(name: string): string`** у `profiles.ts`. Кандидати по черзі, перший валідний за `nicknameSchema` повертається:
  1. перше слово стисненого (`/\s+/g → ' '`, `trim`) імені, обрізане до `LIMITS.nicknameMax`;
  2. стиснене ім'я, обрізане до `LIMITS.nicknameMax` і знову `trim` (поточна поведінка);
  3. `DEFAULT_NICKNAME`.

  Оновити JSDoc функції.

- [ ] **Step 4: Generate the migration.** З теки `apps/server`: `pnpm exec drizzle-kit generate --custom --name short_default_nicknames`. У створений `0005_short_default_nicknames.sql` записати:

```sql
-- Нікнейм за замовчуванням тепер лише ім'я (план 6h). Профілі, яких власник не зберігав
-- (saveProfile завжди ставить новий updated_at; аватар теж зберігається лише через нього),
-- видаляються: ensureProfile створить їх знову під час наступного читання. follow посилається на user.
DELETE FROM "profile" WHERE "updated_at" = "created_at" AND "avatar" IS NULL;
```

- [ ] **Step 5: Run** `pnpm vitest run --maxWorkers=2 apps/server`. Очікується PASS, зокрема `profile-routes.test.ts` (там ім'я «Олена» з одного слова).

- [ ] **Step 6: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/profiles.ts apps/server/src/profiles.test.ts apps/server/src/db/schema.test.ts apps/server/drizzle
git commit -m "feat(server): default nickname is the first name; recreate unsaved profiles"
```

---

### Задача 2. Опис раунду й зведення правил у схемі та зрізах

**Files:**
- Create: `packages/shared/src/round-brief.ts`, `packages/engine/src/round-brief.test.ts`
- Modify: `packages/shared/src/quiz.ts` (`LIMITS.roundDescription`, поле `description` у чотирьох схемах раундів), `packages/shared/src/index.ts`, `packages/shared/src/views.ts` (`RoundInfo`), `packages/engine/src/views.ts` (`roundInfo`)
- Modify (механічно): `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx` (літерали `RoundInfo`)
- Test: `packages/shared/src/quiz.test.ts`, `packages/engine/src/views.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // LIMITS.roundDescription: 200
  // У classicRoundSchema, blitzRoundSchema, boardRoundSchema, finalRoundSchema:
  /** Опис раунду від автора для заставки; старі вікторини без нього. */
  description: z.string().trim().max(LIMITS.roundDescription).refine(isStorable, UNSTORABLE).optional(),
  ```
- Produces (`round-brief.ts`, експорт з `index.ts`):
  ```ts
  /** Налаштування раунду, від яких залежать бали; з цього клієнт складає пояснення для гравців. */
  export interface RoundBrief {
    type: Round['type'];
    /** Класичний: бонус за швидкість. */
    speedBonus: boolean;
    /** Мінус ціна запитання за хибну відповідь (rules.penalty === 'minus'). */
    penalty: boolean;
    streak: RoundRules['streak'];
    multiplier: RoundRules['multiplier'];
    /** Бліц: спроб на запитання; null — без обмежень (і поза бліцом). */
    attempts: 1 | 2 | 3 | null;
    /** Бліц: секунди на відповідь після натискання; null — до кінця таймера (і поза бліцом). */
    answerWindow: number | null;
    /** Поле: є клітинки ×2 або ×3. */
    marks: boolean;
    /** Поле: є бліц-клітинки. */
    blitzCells: boolean;
    /** Поле: є бліц-клітинка зі штрафом для всіх (penalty 'all'). */
    penaltyAll: boolean;
    /** Поле: способи відповіді клітинок (cellAnswerMode), без повторів, у порядку ['phone', 'voice']; поза полем []. */
    answerModes: AnswerMode[];
  }
  /** Зведення без жодної опції: усі прапорці false, streak null, multiplier 1, attempts і answerWindow null, answerModes []. */
  export function emptyBrief(type: Round['type']): RoundBrief;
  export function roundBrief(round: Round): RoundBrief;
  ```
- Produces (`views.ts`): `RoundInfo` отримує
  ```ts
  /** Опис раунду від автора; '' — немає. */
  description: string;
  brief: RoundBrief;
  ```
  `roundInfo` у рушії заповнює `description: round.description ?? ''`, `brief: roundBrief(round)`.

- [ ] **Step 1: Write the failing tests.**

  `quiz.test.ts`:
  ```ts
  it('a round may carry a description and old rounds without one still parse', () => {
    const quiz = (patch: object) => ({ title: 'Т', description: '', settings: DEFAULT_SETTINGS, rounds: [round('r1', [single], patch)] });
    expect(quizSchema.parse(quiz({})).rounds[0].description).toBeUndefined();
    expect(quizSchema.parse(quiz({ description: '  Кіно 90-х  ' })).rounds[0].description).toBe('Кіно 90-х');
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(200) }))).toBe(true);
    expect(valid(quizSchema, quiz({ description: 'а'.repeat(201) }))).toBe(false);
  });
  ```
  `round`, `single`, `valid` і `DEFAULT_SETTINGS` уже є у файлі.

  Тест `roundBrief` лежить у рушії, `packages/engine/src/round-brief.test.ts`: `shared` не може імпортувати фікстури рушія (рушій залежить від `shared`). Імпорт: `roundBrief`, `emptyBrief` з `@quiz/shared`, `classicRound`, `blitzRound`, `boardRound`, `finalRound` з `./testing/fixtures`. Тести:
  - `describes a classic round`: класичний раунд зі `speedBonus: true`, `rules: { penalty: 'minus', partial: null, streak: { length: 3, bonus: { kind: 'percent', value: 20 } }, multiplier: 2 }` дає `{ ...emptyBrief('classic'), speedBonus: true, penalty: true, streak: { length: 3, bonus: { kind: 'percent', value: 20 } }, multiplier: 2 }`;
  - `describes a blitz round`: `answerWindow: 15, attempts: 1`, без штрафу дає `{ ...emptyBrief('blitz'), attempts: 1, answerWindow: 15 }`; з `answerWindow: null, attempts: null` дає ті самі `null`;
  - `describes a board round`: поле з телефонною типовою відповіддю, однією клітинкою `mark: 'x2'`, однією `kind: 'blitz', penalty: 'all'` і однією `answerMode: 'voice'` дає `marks: true, blitzCells: true, penaltyAll: true, answerModes: ['phone', 'voice']`; поле без позначок і бліц-клітинок, усі з телефона, дає `marks: false, blitzCells: false, penaltyAll: false, answerModes: ['phone']`;
  - `describes a final round`: `roundBrief(finalRound(...))` дорівнює `emptyBrief('final')`.

  `views.test.ts`:
  ```ts
  it('every role sees the round description and its rules brief on the intro', () => {
    const quiz = makeRoundsQuiz([
      { ...blitzRound('b1', [single], { attempts: 2 }), description: 'Хто швидший' },
      classicRound('c1', [single]),
    ]);
    const state = must(start(lobbyWith(quiz, 'Анна'), 0));
    for (const view of [stageView(state), hostView(state), playerView(state, state.players[0].id)]) {
      expect(view.round).toMatchObject({ description: 'Хто швидший', brief: roundBrief(quiz.rounds[0]) });
    }
    const second = /* стан на intro другого раунду: next до round_end, потім next */;
    expect(stageView(second).round?.description).toBe('');
  });
  ```
  Назви функцій зрізів і допоміжних функцій узяти ті, що вже використовує `views.test.ts`. Другий раунд досягається тим самим способом, що й у наявних тестах раундів (наприклад, `endRound`, потім `next`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages`. Очікується FAIL: немає `roundBrief`, `description`.

- [ ] **Step 3: Implement** поле `description`, `LIMITS.roundDescription`, `round-brief.ts` (`roundBrief` будується як `{ ...emptyBrief(round.type), ...поля типу }`; для поля використати `boardCells` і `cellAnswerMode`), експорт з `index.ts`, `RoundInfo` і `roundInfo`.

- [ ] **Step 4: Mechanical:** у `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx` кожен літерал `RoundInfo` (`{ index, total, title, type, partial }`) отримує `description: '', brief: emptyBrief('<той самий type>')`. Більше нічого в цих файлах не змінювати.

- [ ] **Step 5: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages apps/web/src/screens
git commit -m "feat(shared): round description and a rules brief in the round info"
```

---

### Задача 3. Пояснення раунду на заставці: сцена, телефон, пульт

**Files:**
- Create: `apps/web/src/round-summary.ts`, `apps/web/src/round-summary.test.ts`, `apps/web/src/screens/RoundBriefing.tsx`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/screens/StageScreen.tsx` (`Intro`, `FinalStage`), `apps/web/src/screens/PlayerScreen.tsx` (гілка `intro`), `apps/web/src/screens/HostScreen.tsx` (панель `intro`), `apps/web/src/styles.css`
- Test: `apps/web/src/screens/StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`

**Interfaces:**
- Consumes: `RoundBrief`, `emptyBrief`, `RoundInfo.description`, `RoundInfo.brief` (задача 2).
- Produces:
  ```ts
  // round-summary.ts
  /** 2–4 рядки простою мовою: як цей раунд рахує бали. */
  export function roundSummary(brief: RoundBrief): string[];
  // screens/RoundBriefing.tsx
  /** Опис автора (якщо є) і пояснення правил раунду; для заставки й попереднього перегляду в редакторі. */
  export function RoundBriefing(props: { brief: RoundBrief; description: string }): JSX.Element;
  ```

**Тексти (`i18n.ts`, точно):**
```ts
roundBriefTitle: 'Як нараховуються бали',
summaryClassic: 'Відповідають усі: бали отримує кожен, хто відповів правильно.',
summarySpeed: 'Що швидша правильна відповідь, то більше балів.',
summaryBlitz: 'Бали отримує лише той, хто першим правильно відповість.',
summaryBlitzHow: 'Натисніть «Відповісти», щоб стати в чергу, і відповідайте {window}.',
summaryBlitzWindow: 'за {count} с',
summaryBlitzNoWindow: 'до кінця таймера',
summaryAttempts: 'Спроб на запитання: {count}',
summaryAttemptsUnlimited: 'Спроб без обмежень',
summaryBoard: 'Гравці по черзі вибирають клітинку; відповідає той, хто вибрав.',
summaryBoardPhone: 'Відповідь — на телефоні.',
summaryBoardVoice: 'Відповідь — вголос, оцінює ведучий.',
summaryBoardMixed: 'Відповідь — на телефоні або вголос, залежно від клітинки.',
summaryBoardBlitz: 'На бліц-клітинці відповідає перший, хто натисне «Відповісти»; хто вибрав клітинку, отримує подвійну ціну.',
summaryFinal: 'Кожен таємно ставить від 0 до свого рахунку.',
summaryFinalScore: 'Правильна відповідь — плюс ставка, неправильна або жодної — мінус ставка.',
summaryPenalty: 'Помилка: мінус ціна запитання',
summaryStreakPercent: 'Серія з {length} правильних: +{value}%',
summaryStreakFixed: 'Серія з {length} правильних: +{value}',
summaryMultiplier: 'Усі бали ×{value}',
summaryMarks: 'Є клітинки ×2 і ×3',
summaryPenaltyAll: 'Деякі бліц-клітинки: мінус усім, крім того, хто вгадав',
```

**Складання `roundSummary`** (рядок модифікаторів — частини через `' · '`; порожній рядок не додається):
- `classic`: `summaryClassic`; `summarySpeed`, якщо `speedBonus`; модифікатори `[penalty, streak, multiplier]`.
- `blitz`: `summaryBlitz`; `summaryBlitzHow` з `window` = `summaryBlitzWindow` або `summaryBlitzNoWindow`; модифікатори `[attempts (summaryAttempts або summaryAttemptsUnlimited), penalty, streak, multiplier]` — у бліці цей рядок є завжди.
- `board`: `summaryBoard`; спосіб відповіді (`['phone']` → Phone, `['voice']` → Voice, обидва → Mixed, порожньо → нічого); `summaryBoardBlitz`, якщо `blitzCells`; модифікатори `[marks, penaltyAll, penalty, streak, multiplier]`.
- `final`: `summaryFinal`, `summaryFinalScore`.
- Частина штрафу — `summaryPenalty`, якщо `penalty`; серії — `summaryStreakPercent` / `summaryStreakFixed`, якщо `streak !== null`; множника — `summaryMultiplier`, якщо `multiplier > 1`.

**Розмітка `RoundBriefing`:**
```tsx
<div className="round-brief">
  {description.trim() !== '' && <p className="round-brief-note">{description}</p>}
  <ul className="round-brief-lines" aria-label={t('roundBriefTitle')}>
    {roundSummary(brief).map((line) => <li key={line}>{line}</li>)}
  </ul>
</div>
```

**Стилі:** `.round-brief` — `display: grid; gap: 0.5rem; max-width: 40rem`. `.round-brief-note` — колір `--amber`, `overflow-wrap: anywhere`. `.round-brief-lines` — `margin: 0; padding-left: 1.25rem; display: grid; gap: 0.375rem; color: var(--paper)`. `.stage .round-brief` — `font-size: clamp(1.125rem, 2vw, 2rem); margin: 0 auto` (читається з дивана й не перевищує 4 рядки на 1600×900).

- [ ] **Step 1: Write the failing tests.**

  `round-summary.test.ts` (з `emptyBrief`):
  ```ts
  it('a default classic round: everyone answers, faster is more', () => {
    expect(roundSummary({ ...emptyBrief('classic'), speedBonus: true })).toEqual([
      'Відповідають усі: бали отримує кожен, хто відповів правильно.',
      'Що швидша правильна відповідь, то більше балів.',
    ]);
  });
  it('a classic round lists the penalty, the streak and the multiplier on one line', () => {
    const brief = { ...emptyBrief('classic'), penalty: true, multiplier: 2 as const, streak: { length: 2, bonus: { kind: 'percent' as const, value: 20 } } };
    expect(roundSummary(brief)).toEqual([
      'Відповідають усі: бали отримує кожен, хто відповів правильно.',
      'Помилка: мінус ціна запитання · Серія з 2 правильних: +20% · Усі бали ×2',
    ]);
  });
  it('a blitz round says that only the first right answer scores', () => {
    expect(roundSummary({ ...emptyBrief('blitz'), attempts: 1, answerWindow: 15 })).toEqual([
      'Бали отримує лише той, хто першим правильно відповість.',
      'Натисніть «Відповісти», щоб стати в чергу, і відповідайте за 15 с.',
      'Спроб на запитання: 1',
    ]);
    expect(roundSummary({ ...emptyBrief('blitz'), penalty: true })).toEqual([
      'Бали отримує лише той, хто першим правильно відповість.',
      'Натисніть «Відповісти», щоб стати в чергу, і відповідайте до кінця таймера.',
      'Спроб без обмежень · Помилка: мінус ціна запитання',
    ]);
  });
  it('a board round: turns, the answer mode and blitz cells', () => {
    expect(roundSummary({ ...emptyBrief('board'), answerModes: ['phone'] })).toEqual([
      'Гравці по черзі вибирають клітинку; відповідає той, хто вибрав.',
      'Відповідь — на телефоні.',
    ]);
  });
  it('never takes more than four lines', () => {
    const everything = {
      ...emptyBrief('board'), answerModes: ['phone', 'voice'] as AnswerMode[], marks: true, blitzCells: true, penaltyAll: true,
      penalty: true, multiplier: 3 as const, streak: { length: 3, bonus: { kind: 'fixed' as const, value: 200 } },
    };
    expect(roundSummary(everything)).toEqual([
      'Гравці по черзі вибирають клітинку; відповідає той, хто вибрав.',
      'Відповідь — на телефоні або вголос, залежно від клітинки.',
      'На бліц-клітинці відповідає перший, хто натисне «Відповісти»; хто вибрав клітинку, отримує подвійну ціну.',
      'Є клітинки ×2 і ×3 · Деякі бліц-клітинки: мінус усім, крім того, хто вгадав · Помилка: мінус ціна запитання · Серія з 3 правильних: +200 · Усі бали ×3',
    ]);
    for (const type of ['classic', 'blitz', 'final'] as const) {
      expect(roundSummary({ ...everything, type, attempts: 3, answerWindow: 30, speedBonus: true }).length).toBeLessThanOrEqual(4);
    }
  });
  it('a final round explains the secret wager', () => {
    expect(roundSummary(emptyBrief('final'))).toEqual([
      'Кожен таємно ставить від 0 до свого рахунку.',
      'Правильна відповідь — плюс ставка, неправильна або жодної — мінус ставка.',
    ]);
  });
  ```

  `StageScreen.test.tsx`, `describe('StageScreen: rounds')`:
  - `the intro shows the author note and the rules summary`: `view({ phase: 'intro', round: { ...round, description: 'Кіно 90-х', brief: { ...emptyBrief('blitz'), attempts: 1, answerWindow: 15 } } })` показує «Кіно 90-х» і «Бали отримує лише той, хто першим правильно відповість.».
  - `the intro shows the rules summary without an empty note`: з `description: ''` немає `.round-brief-note`, а `getByRole('list', { name: 'Як нараховуються бали' })` має 2 пункти для класичного `speedBonus: true`.
  - У `describe` фіналу: на `intro` під темою є «Кожен таємно ставить від 0 до свого рахунку.», а на `wager` цього тексту немає.

  `PlayerScreen.test.tsx`: `the intro explains the round on the phone` — на `intro` з описом і бліцом видно опис і «Бали отримує лише той…».

  `HostScreen.test.tsx`: `the host sees the round summary to read it aloud` — панель `intro` містить рядки пояснення й опис.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement** тексти, `roundSummary`, `RoundBriefing`, стилі. Вставити `<RoundBriefing brief={round.brief} description={round.description} />`:
  - `StageScreen.tsx`, `Intro`: після `<h1>` назви раунду, перед порядком гравців поля;
  - `StageScreen.tsx`, `FinalStage`: після теми лише при `view.phase === 'intro'`;
  - `PlayerScreen.tsx`: у гілці `phase === 'intro'` після `<h1>`;
  - `HostScreen.tsx`: у панелі `phase === 'intro' && round !== null` після `<h1>`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): a plain-language rules summary on the round intro"
```

---

### Задача 4. Редактор: назва й правила вгорі, опис раунду й попередній перегляд

**Files:**
- Modify: `apps/web/src/editor/QuizEditor.tsx`, `apps/web/src/editor/RoundSettings.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `roundBrief`, `LIMITS.roundDescription` (задача 2), `RoundBriefing` (задача 3).

**Тексти (`i18n.ts`, точно):**
```ts
roundDescriptionLabel: 'Опис раунду для гравців',
roundDescriptionPlaceholder: 'Необов’язково. Наприклад, усі запитання про кіно 90-х',
roundBriefPreview: 'Так гравці побачать раунд на заставці',
```

- [ ] **Step 1: Write the failing tests** у `QuizEditor.test.tsx`, новий `describe('QuizEditor: quiz on top and round notes')`:

```ts
it('puts the quiz title and the game rules above the rounds', () => {
  open();
  const title = screen.getByLabelText('Назва вікторини');
  const rules = screen.getByText('Правила гри');
  const addRoundButton = screen.getByRole('button', { name: '+ Раунд' });
  const roundSettings = screen.getByText('Налаштування раунду');
  const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  expect(before(title, rules)).toBe(true);
  expect(before(rules, addRoundButton)).toBe(true);
  expect(before(rules, roundSettings)).toBe(true);
});

it('saves an author note of the round and previews the rules summary', async () => {
  const { onSave } = open();
  fireEvent.click(screen.getByText('Налаштування раунду'));
  expect(screen.getByText('Так гравці побачать раунд на заставці')).toBeTruthy();
  expect(screen.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.')).toBeTruthy();
  fill('Опис раунду для гравців', 'Кіно 90-х');
  expect(screen.getAllByText('Кіно 90-х').length).toBeGreaterThan(0);

  addRound('Бліц');
  fireEvent.click(screen.getByText('Налаштування раунду'));
  expect(screen.getByText('Бали отримує лише той, хто першим правильно відповість.')).toBeTruthy();

  // Заповнити обидва раунди до валідного стану тими самими кроками, що й наявні тести раундів, і зберегти.
  …
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(saved(onSave).rounds[0].description).toBe('Кіно 90-х');
});
```

  Якщо `details` після перемикання раунду вже відкритий (React зберігає стан елемента), другий клік його закриє: відкривати через перевірку `open`, як `openRoundSettings` у e2e. Поле опису має `maxLength={LIMITS.roundDescription}`: перевірити `screen.getByLabelText('Опис раунду для гравців').getAttribute('maxlength')` дорівнює `'200'`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - `QuizEditor.tsx`: поле «Назва вікторини» і `<details className="rules">` («Правила гри») переходять з `editor-side` у нову `<section className="editor-quiz">` одразу після повідомлення `notice`, перед `<RoundStrip>`. В `aside` лишаються навігація, список і «Додати запитання». Оновити JSDoc компонента: зверху назва й правила, далі раунди; ліворуч список запитань, праворуч запитання.
  - `RoundSettings.tsx`: після поля назви раунду поле `<label className="field"><span>{t('roundDescriptionLabel')}</span><textarea rows={2} maxLength={LIMITS.roundDescription} placeholder={t('roundDescriptionPlaceholder')} value={round.description ?? ''} onChange={(event) => onChange({ ...round, description: event.target.value })} /></label>`. В кінці `details`: `<div className="round-brief-preview"><p className="meta">{t('roundBriefPreview')}</p><RoundBriefing brief={roundBrief(round)} description={round.description ?? ''} /></div>`. Оновити JSDoc.
  - `styles.css`: `.editor-quiz { display: grid; gap: 0.875rem; margin-bottom: 0.75rem; }`; `.round-brief-preview { display: grid; gap: 0.5rem; border-top: 1px solid var(--line); padding-top: 0.75rem; }`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS, наявні тести редактора без змін (вони шукають поля за підписами).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): quiz title and rules on top of the editor; round notes with a preview"
```

---

### Задача 5. Наскрізні перевірки й кадри

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з попередніх задач. Допоміжні функції файлу: `open`, `shot`, `openRoundSettings`, `expectNoSideScroll`, `field`, `click`. `expectPhoneFit` не підходить: він вимагає нижнього меню, якого немає на екранах гри, і перевіряє останній елемент над меню, а редактор має закріплену панель «Зберегти».

- [ ] **Step 1: Extend `twoRounds()`** (сценарій `a two-round game with an early round end…`):
  1. Одразу після переходу на «Нова вікторина» перевірити порядок на комп'ютері: `(await field(host, 'Назва вікторини').boundingBox())!.y` менше за `y` кнопки «+ Раунд». Кадр `editor-top-desktop`.
  2. `await host.setViewportSize({ width: 375, height: 812 })`, та сама перевірка порядку, `expectNoSideScroll(host, 'editor-top-phone-375')` (перевіряє відсутність горизонтальної прокрутки й знімає кадр), потім `setViewportSize({ width: 1280, height: 900 })`.
  3. Раунд 2: після назви «Фінал» заповнити «Опис раунду для гравців» = «Тут помилка коштує балів #найнайнайнайскладнішийраунд» (довге слово без пробілів перевіряє перенесення). Попередній перегляд у `details.round-settings .round-brief-preview` містить «Помилка: мінус ціна запитання · Серія з 2 правильних: +20%». Кадр `editor-round-brief`.
  4. На заставці раунду 2 (після «Наступний раунд», перед «Почати раунд»): сцена й телефон Тараса (360×740) показують цей опис і «Помилка: мінус ціна запитання · Серія з 2 правильних: +20%». Кадр `round-brief-stage`; `expectNoSideScroll(taras, 'round-brief-phone-360')` (знімає кадр телефона).
  5. На заставці раунду 1 сцена показує «Відповідають усі: бали отримує кожен, хто відповів правильно.» і не має `.round-brief-note`.

- [ ] **Step 2: Extend `menuProfileFriends()`**: перед «Змінити нікнейм / аватар» перевірити, що профіль Олі (акаунт «Оля Гравець») має заголовок «Оля»: `await olya.getByRole('heading', { name: 'Оля', exact: true }).waitFor()`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв. Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`: назва й «Правила гри» над смугою раундів на обох ширинах; пояснення на сцені читається, займає не більше 4 рядків і не накладається на інше; на телефоні 360 px текст переноситься.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: editor top, round notes on the intro and the first-name nickname end-to-end"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Міграція `0005` застосується на Render під час запуску сервера.
