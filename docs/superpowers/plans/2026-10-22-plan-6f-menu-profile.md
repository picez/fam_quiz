# План 6f: меню й профіль

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** на всіх сторінках, крім екранів гри (гравець, пульт, сцена), є меню: на телефоні панель унизу, на комп'ютері рядок угорі. З акаунтом у меню «Приєднатися», «Мої вікторини», «Історія», «Профіль», без акаунта лише «Приєднатися» й «Увійти». У кожного користувача є профіль за погодженим макетом (варіант C). Власник бачить аватар, нікнейм, email, статистику, ачівки, свої вікторини, перемоги й друзів. Публічну частину бачить будь-хто за посиланням: нікнейм, аватар, статистика, ачівки й «Додати в друзі». Друзі — це одностороння підписка без підтвердження.

**Архітектура:**
- **Дані профілю** лежать в окремій таблиці `profile` (`user_id`, `nickname`, `nickname_key`, `avatar`), а не в таблиці `user` Better Auth. Так бібліотека авторизації нічого не знає про нікнейм, а `user.name` лишається ім'ям з реєстрації чи Google. Рядок профілю створюється ліниво, під час першого читання (`ensureProfile`): нікнейм за замовчуванням береться з `user.name`, а якщо він зайнятий, отримує суфікс « 2», « 3»… Унікальність забезпечує унікальний індекс на `nickname_key = normalizeText(nickname)` з рушія. Регістр, зайві пробіли й різні апострофи не дають двох «однакових» нікнеймів.
- **Друзі** зберігаються в таблиці `follow` (`follower_id`, `followee_id`, первинний ключ з обох). Обидва ключі каскадно видаляються разом з акаунтом.
- **Статистика й ачівки** нічого не зберігають: їх щоразу рахують з історії (`participant.user_id`, `answer`, `game.host_id`, `quiz.owner_id`). Тому окремого перерахунку немає. Обчислення розділено на дві частини:
  - чисті функції: `gameStats` у `packages/shared/src/profile.ts` (її ж бере сторінка «Мої ігри») і `achievementsOf`, `bestStreak`, `isPerfect` в `apps/server/src/achievements.ts`;
  - збирання даних з бази в `apps/server/src/profiles.ts`.
- **Приватність** гарантує форма відповіді. Є два окремі маршрути з двома окремими типами: `GET /api/me/profile` повертає `OwnProfile` (лише власнику, за сесією), `GET /api/profiles/:id` повертає `PublicProfile`. Публічна відповідь будується явним переліком полів, а не вилученням полів з приватної. Тести перевіряють точний набір ключів і відсутність email, назв вікторин і нікнеймів друзів у тексті відповіді.
- **Меню** — це макетний маршрут `WithMenu` (`<Outlet />`) у новому `apps/web/src/AppRoutes.tsx`. Маршрути `/play/:code`, `/host/:code`, `/stage/:code` лежать поза ним, тож на екранах гри меню немає за самою будовою. `useAccount` отримує параметр оновлення: меню передає `location.key` і бачить вхід чи вихід без перезавантаження сторінки.
- **Аватар** завантажується наявним `POST /api/uploads` (те саме R2, що й для зображень запитань). Профіль зберігає лише шлях `/uploads/<назва>`, що проходить `AVATAR_URL`. Без аватара показується перша літера нікнейма на кольоровому тлі з токенів теми.

**Технології:** TypeScript, zod 4, vitest, Fastify + Better Auth, Drizzle + drizzle-kit (PGlite у тестах, Render Postgres у роботі), React + React Router, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-21-after-first-game-design.md`, частина F (розділ 8), а також розділи 2 (анти-цілі: історія не ламається), 9 (розгортання після частини) і 10 (вигляд у межах наявного стилю). Макет: `.superpowers/brainstorm/1168-1792141913/content/profile.html` (варіант C).

**Рішення плану там, де специфікація мовчить:**
- **Статистика з минулих ігор.** Історія зберігає зв'язок гравця з акаунтом (`participant.user_id`) ще з плану 2c. Тому умова специфікації «якщо не зберігала — не перераховувати» тут не діє. Статистика рахується з усіх записаних ігор, де гравець увійшов перед приєднанням, і нічого не перераховується: усе обчислюється під час читання.
- **Визначення (однакові з наявною сторінкою «Мої ігри»):**
  - «ігор» — усі рядки історії гравця з акаунта;
  - «перемога» — перше місце в завершеній грі, де гравців більше одного й рахунок більший за 0;
  - «% правильних» — зараховані запитання / зіграні запитання (`correct / questionsPlayed`), `null`, якщо запитань не було;
  - «вікторин» — кількість вікторин користувача;
  - «проведено ігор» — завершені ігри, де користувач був ведучим.

  Функцію `summarize` з `MyGames.tsx` перенесено в `gameStats` у shared, щоб профіль і «Мої ігри» не розходилися.
- **Ачівки.** Шість зі специфікації й дві додаткові, які в макеті стоять заблокованими. Усі вісім видно завжди, неотримані показуються заблокованими (🔒).

  | id | Назва | Умова |
  |---|---|---|
  | `first_game` | Перша гра | ігор ≥ 1 |
  | `first_win` | Перша перемога | перемог ≥ 1 |
  | `games_10` | 10 ігор | ігор ≥ 10 |
  | `streak_5` | Серія 5 правильних поспіль | `bestStreak` ≥ 5 |
  | `perfect_game` | Ідеальна гра | є гра з `isPerfect` |
  | `host` | Ведучий | проведено ігор ≥ 1 |
  | `games_50` | 50 ігор | ігор ≥ 50 |
  | `wins_10` | 10 перемог | перемог ≥ 10 |

  - **Серія** рахується в межах однієї гри за запитаннями, на які гравець відповідав (рядки `answer`, крім штрафного `PENALTY_ATTEMPT`), у порядку `question_index`. Запитання зараховане, якщо прийнято хоч одну спробу. Незараховане запитання обриває серію. Запитання без рядка (чужа клітинка поля, гравець не відповів) серію не обриває: інакше в полі серія була б неможлива.
  - **Ідеальна гра** — завершена гра, у якій гравець відповів щонайменше на 5 запитань і жодна його спроба не відхилена (рядків з `accepted = false`, крім штрафних, немає).
- **Що публічне.** Публічно видно нікнейм, аватар, усі п'ять чисел статистики (кількість вікторин теж, але не їхній перелік) і ачівки. Лише власнику видно email, перелік вікторин, перемоги з датами й друзів. На публічній сторінці замість email написано «email приховано», як у макеті. Власник, який відкрив власну публічну сторінку, отримує ту саму публічну відповідь без email.
- **Як знайти друга:**
  1. кнопка «Додати в друзі» на публічному профілі (посиланням можна поділитися; на своєму профілі є «Мій публічний профіль»);
  2. поле «Додати друга» на своєму профілі: точний збіг нікнейма через `nickname_key`.

  Пошуку за частиною нікнейма й переліку всіх користувачів немає, щоб профілі не можна було перебрати. Посилань з історії гри на профілі гравців теж немає (YAGNI): для цього історії ведучого довелося б віддавати id акаунтів гравців.
- **Нікнейм:** 2–20 символів (`LIMITS.nicknameMin/Max`, як у грі). Пробіли на краях обрізаються, кілька пробілів поспіль стискаються в один. Рядок проходить `isStorable`. Нікнейм унікальний без різниці регістру. Нікнейм профілю не підставляється в поле імені під час приєднання до гри (YAGNI): ім'я в грі, як і раніше, вводять у кожній грі.
- **Аватар:** лише завантажене зображення (JPEG/PNG/WebP до 2 МБ через `/api/uploads`) або запасний варіант з літерою. Вибору емодзі немає. Картинку з Google не беремо: це стороння адреса. Сервер не перевіряє, хто завантажив файл за шляхом `/uploads/…`: шлях можна лише вибрати з уже завантажених, і нічого приватного він не відкриває.
- **Меню:**
  - пункти з акаунтом: «Приєднатися» → `/`, «Мої вікторини» → `/quizzes`, «Історія» → `/history` (активна також на `/history/*` і `/me`), «Профіль» → `/profile` (активний на `/profile*`);
  - без акаунта: «Приєднатися» й «Увійти» → `/login?next=<поточний шлях>`;
  - поки невідомо, хто на сторінці, лише «Приєднатися»;
  - «Створити» лишається кнопкою «Нова вікторина» на сторінці вікторин.
- **Історія:** на `/history` (проведені) і `/me` (зіграні) зверху є перемикач «Проведені / Зіграні». Посилання «Історія ігор» і «Мої ігри» з панелі сторінки вікторин і посилання «Мої вікторини»/«Мої ігри» з головної для того, хто увійшов, прибрано: їх замінило меню. «Я ведучий» на головній для відвідувача лишається (на нього спираються наскрізні сценарії).
- **«Вийти»** переїжджає з шапки сторінки вікторин у профіль.
- **Тема:** сайт має лише темну тему (`color-scheme: dark`, токени в `:root`). Нові стилі беруть лише наявні токени. Нових кольорів немає.

## Глобальні обмеження

- Значення (точно зі специфікації):
  - меню є на всіх сторінках, крім екранів гри (гравець, пульт, сцена);
  - пункти: «Приєднатися», «Мої вікторини», «Історія», «Профіль»; без входу лише «Приєднатися» і «Увійти»;
  - телефон: панель унизу екрана; комп'ютер: рядок угорі;
  - email не бачить ніхто, крім власника; вікторини й друзів бачить лише власник;
  - додавання друга одностороннє, без підтвердження;
  - статистика: за іграми, де користувач грав з акаунта; ігри, де він був ведучим, — окремо, «проведено ігор»; місце за підсумковим рахунком, як в історії;
  - «Ідеальна гра»: жодної помилки, щонайменше 5 запитань.
- Старі ігри, історія ведучого й «Мої ігри» працюють, як раніше. Міграція `0004_profiles` лише додає таблиці. Сервер застосовує міграції під час запуску (`connectDb`), тож на Render вона пройде з першим розгортанням після пушу.
- Приватність перевіряється на рівні API, а не лише в інтерфейсі.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`; кольори лише через наявні токени `styles.css`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Наскрізні сценарії: `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Наявні сценарії мають лишатися зеленими після кожної задачі.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий).

## Порядок збирання

- Задача 1 (shared) не змінює наявних типів, лише додає нові, тож нічого не ламає.
- Задачі 2–5 стосуються лише сервера. Задачі 6–8 стосуються лише web. Сторінки профілю (7, 8) спираються на маршрути із задач 4–5 лише через типи shared і функції `api.ts`, тож у юніт-тестах web API підміняється.
- Тести сторінок рендерять сторінку без меню (як зараз), тож меню не зачіпає наявних тестів сторінок.

## На що дивитися рецензентові

1. **Власник відкриває власну публічну сторінку `/api/profiles/<свій id>`.** Email там немає, як і вікторин чи друзів: приватне віддає лише `/api/me/profile`. Тест: задача 4, `the public profile never carries private fields, not even for its owner`.
2. **Нікнейм, що відрізняється лише регістром, пробілами чи апострофом** («Оля  К’» проти «оля к'»), вважається зайнятим, а свій власний нікнейм з іншим регістром зберегти можна. Тест: задача 2, `nicknames are unique regardless of case, spacing and apostrophes`.
3. **Людина входить на сторінці входу й переходить далі без перезавантаження.** Меню одразу показує чотири пункти, а після «Вийти» — знову «Приєднатися» й «Увійти». Тест: задача 6, `the menu follows sign-in and sign-out without a reload`.
4. **Підставлений аватар:** `https://evil.example/x.png`, `/uploads/../secret.png`, `javascript:alert(1)`, `/uploads/x.svg` відхиляються з 400, профіль не змінюється. Тест: задача 1 (`profileUpdateSchema`) і задача 4, `a foreign avatar address is refused`.
5. **Друг видалив акаунт.** Він зникає зі списку друзів, а не лишається «привидом» без профілю. Сам профіль за його id дає 404. Тест: задача 2, `removing a user removes their profile and every follow both ways`; задача 4, `an unknown or removed user has no profile`.

---

### Задача 1. Спільні типи профілю, перевірка змін і зведення ігор

**Files:**
- Create: `packages/shared/src/profile.ts`, `packages/shared/src/profile.test.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './profile'`)
- Modify: `apps/web/src/pages/MyGames.tsx` (`summarize` → `gameStats` з `@quiz/shared`)
- Test: `packages/shared/src/profile.test.ts`, наявний `apps/web/src/pages/MyGames.test.tsx` лишається зеленим без змін

**Interfaces:**
- Produces (shared, `profile.ts`):
  ```ts
  /** Шлях до завантаженого зображення: лише така форма може бути аватаром. */
  export const AVATAR_URL = /^\/uploads\/[a-z0-9]{16,64}\.(jpg|png|webp)$/;
  /** Нікнейм профілю: краї обрізано, пробіли стиснуто; 2–20 символів; придатний для бази. */
  export const nicknameSchema: z.ZodType<string>;
  export const profileUpdateSchema = z.object({ nickname: nicknameSchema, avatar: z.string().regex(AVATAR_URL).nullable() }).strict();
  export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

  export const ACHIEVEMENTS = ['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10'] as const;
  export type AchievementId = (typeof ACHIEVEMENTS)[number];
  export interface Achievement { id: AchievementId; earned: boolean }

  export interface ProfileStats {
    games: number;
    wins: number;
    /** Відсоток зарахованих від зіграних запитань; null — запитань не було. */
    accuracy: number | null;
    quizzes: number;
    /** Завершені ігри, де користувач був ведучим. */
    hosted: number;
  }
  /** Те, що видно про користувача в будь-якому списку. */
  export interface ProfileCard { id: string; nickname: string; avatar: string | null }
  export interface PublicProfile extends ProfileCard {
    stats: ProfileStats;
    achievements: Achievement[];
    /** Чи підписаний той, хто дивиться; null — не увійшов або це його власний профіль. */
    following: boolean | null;
  }
  export interface ProfileWin { gameId: string; title: string; startedAt: string; rank: number }
  export interface OwnProfile extends ProfileCard {
    email: string;
    stats: ProfileStats;
    achievements: Achievement[];
    quizzes: { id: string; title: string }[];
    wins: ProfileWin[];
    friends: ProfileCard[];
  }

  type Counted = Pick<PlayedGame, 'status' | 'rank' | 'score' | 'playerCount' | 'correct' | 'questionsPlayed'>;
  /** Перемога: перше місце в завершеній грі, де гравців більше одного й рахунок більший за 0. */
  export function isWin(game: Counted): boolean;
  /** Ігри, перемоги й частка правильних (округлено до цілого відсотка). */
  export function gameStats(games: Counted[]): { games: number; wins: number; accuracy: number | null };
  ```
  `nicknameSchema` = `z.string().max(100).transform((v) => v.replace(/\s+/g, ' ').trim()).pipe(z.string().min(LIMITS.nicknameMin).max(LIMITS.nicknameMax).refine(isStorable, UNSTORABLE))`. Помилку нікнейма сервер повертає як `nickname_invalid`, тож шлях помилки (`issues[0].path[0] === 'nickname'`) має бути видно.

- [ ] **Step 1: Write the failing tests**

```ts
describe('profileUpdateSchema', () => {
  it('tidies a nickname and keeps a valid avatar', () => {
    expect(profileUpdateSchema.parse({ nickname: '  Оля   К ', avatar: '/uploads/0123456789abcdef.png' }))
      .toEqual({ nickname: 'Оля К', avatar: '/uploads/0123456789abcdef.png' });
    expect(profileUpdateSchema.parse({ nickname: 'Оля 🙂', avatar: null }).avatar).toBeNull();
  });
  it.each(['О', ' О ', 'а'.repeat(21), 'a\u0000b'])('refuses the nickname %j', (nickname) => {
    expect(profileUpdateSchema.safeParse({ nickname, avatar: null }).success).toBe(false);
  });
  it.each(['https://evil.example/x.png', '/uploads/../secret.png', 'javascript:alert(1)', '/uploads/0123456789abcdef.svg', '/uploads/SHORT.png'])(
    'refuses the avatar %s', (avatar) => {
      expect(profileUpdateSchema.safeParse({ nickname: 'Оля', avatar }).success).toBe(false);
    });
  it('refuses unknown fields', () => {
    expect(profileUpdateSchema.safeParse({ nickname: 'Оля', avatar: null, email: 'x@y.z' }).success).toBe(false);
  });
});
describe('gameStats', () => {
  // game(over) — PlayedGame-подібний рядок: finished, rank 1, score 100, playerCount 2, correct 3, questionsPlayed 4
  it('counts a win only for a finished first place with a rival and points', () => {
    // gameStats([game({}), game({ status: 'aborted' }), game({ playerCount: 1 }), game({ score: 0 }), game({ rank: 2 })])
    //   → { games: 5, wins: 1, accuracy: 75 }
  });
  it('has no accuracy without played questions', () => {
    // gameStats([]) → { games: 0, wins: 0, accuracy: null }; gameStats([game({ questionsPlayed: 0, correct: 0 })]).accuracy === null
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/profile.test.ts`
Expected: FAIL (модуля `./profile` немає).

- [ ] **Step 3: Implement** `profile.ts` за інтерфейсом, export в `index.ts`. `MyGames.tsx` замість локальної `summarize` викликає `gameStats(state.data)`, розмітка та сама.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; `MyGames.test.tsx` зелений без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/pages/MyGames.tsx
git commit -m "feat(shared): profile types, profile update validation, shared game stats"
```

---

### Задача 2. База: таблиці `profile` і `follow`, нікнейм за замовчуванням і його унікальність

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/drizzle/0004_profiles.sql`, `apps/server/drizzle/meta/0004_snapshot.json`, запис у `meta/_journal.json` (через `drizzle-kit generate`)
- Create: `apps/server/src/profiles.ts`, `apps/server/src/profiles.test.ts`
- Test: `apps/server/src/db/schema.test.ts`, `apps/server/src/profiles.test.ts`

**Interfaces:**
- Consumes: `ProfileCard`, `ProfileUpdate` (задача 1), `normalizeText` з `@quiz/engine`.
- Produces (schema):
  ```ts
  export const profile = pgTable('profile', {
    userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    /** normalizeText(nickname): нікнейм унікальний без різниці регістру, пробілів і апострофів. */
    nicknameKey: text('nickname_key').notNull().unique(),
    /** Шлях /uploads/<назва> або null. */
    avatar: text('avatar'),
    ...stamps,
  });
  /** Підписка «follower додав followee в друзі»; одностороння. */
  export const follow = pgTable('follow', {
    followerId: text('follower_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: at('created_at').notNull().defaultNow(),
  }, (table) => [primaryKey({ columns: [table.followerId, table.followeeId] }), index('follow_followee_idx').on(table.followeeId)]);
  ```
- Produces (`profiles.ts`):
  ```ts
  export const DEFAULT_NICKNAME = 'Гравець';
  export const nicknameKey = (nickname: string) => normalizeText(nickname);
  /** Профіль користувача; створює його з нікнеймом за замовчуванням, якщо ще немає. null — такого користувача немає. */
  export async function ensureProfile(db: Db, userId: string): Promise<ProfileCard | null>;
  /** Зберігає нікнейм і аватар; зайнятий іншим нікнейм — помилка. */
  export async function saveProfile(db: Db, userId: string, update: ProfileUpdate):
    Promise<{ ok: true; profile: ProfileCard } | { ok: false; error: 'nickname_taken' }>;
  ```
  Нікнейм за замовчуванням:
  - основа — `user.name`, стиснута, як у `nicknameSchema`, і обрізана до 20 символів; якщо основа коротша за 2 символи або не проходить `isStorable`, береться `DEFAULT_NICKNAME`;
  - кандидати: основа, далі `основа 2`, `основа 3`… (основа обрізається так, щоб із суфіксом було ≤ 20, і пробіл у кінці обрізаної основи прибирається);
  - кожен кандидат: `insert … onConflictDoNothing()` (без цілі, тож спрацьовує і на `user_id`, і на `nickname_key`), потім `select` за `user_id`. Є рядок — повернути його (так безпечно для двох одночасних викликів). Немає — наступний кандидат.

  `saveProfile` спершу викликає `ensureProfile`, потім робить `update`; порушення унікальності `nickname_key` (код Postgres `23505`) перетворюється на `nickname_taken`.

- [ ] **Step 1: Write the failing tests**

```ts
// profiles.test.ts (createTestDb, користувачі вставляються прямо в user)
it('makes a default nickname from the account name', async () => {
  // user u1 name 'Олена Петренко' → ensureProfile(db,'u1') → { id: 'u1', nickname: 'Олена Петренко', avatar: null }
  // другий виклик повертає те саме, рядок у profile один
});
it('adds a number when the default nickname is taken', async () => {
  // u1 і u2 обидва 'Олена' → 'Олена', 'Олена 2'; u3 'олена' → 'олена 3'
});
it('fits a long name with its number into 20 characters and replaces an unusable one', async () => {
  // u1 і u2 name 'Олександра-Анастасія Ш' (22) → 'Олександра-Анастасія' (20) і 'Олександра-Анастас 2' (20)
  // u3 name 'Я' → 'Гравець'
});
it('two simultaneous first reads create one profile', async () => {
  // const [a, b] = await Promise.all([ensureProfile(db,'u1'), ensureProfile(db,'u1')]) → a toEqual b; select profile → 1 рядок
});
it('has no profile for an unknown user', async () => {
  // ensureProfile(db, 'nobody') → null
});
it('nicknames are unique regardless of case, spacing and apostrophes', async () => {
  // saveProfile(u1, { nickname: 'Оля К’', avatar: null }) → ok
  // saveProfile(u2, { nickname: 'оля к\'', avatar: null }) → { ok: false, error: 'nickname_taken' }
  // saveProfile(u1, { nickname: 'ОЛЯ К’', avatar: '/uploads/0123456789abcdef.png' }) → ok, nickname 'ОЛЯ К’', avatar збережено
});
// schema.test.ts
it('removing a user removes their profile and every follow both ways', async () => {
  // u1,u2,u3; profile u1,u2; follow u1→u2, u2→u1, u3→u2; delete user u2 → profile без u2; follow лише рядки без u2 (жодного)
});
it('the profiles migration applies over an existing database', async () => {
  // createTestDbUpTo('0003_blitz_attempts'), вставити user, migrateRest(), ensureProfile для нього працює
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server/src/profiles.test.ts apps/server/src/db/schema.test.ts`
Expected: FAIL (`profile` / `ensureProfile` не існують).

- [ ] **Step 3: Implement** таблиці в `schema.ts`. Згенерувати міграцію з теки `apps/server`: `pnpm exec drizzle-kit generate --name profiles`. Переглянути SQL: лише `CREATE TABLE "profile"`, `CREATE TABLE "follow"`, зовнішні ключі `ON DELETE cascade`, унікальне обмеження на `nickname_key`, індекс `follow_followee_idx`. Жодних змін наявних таблиць. Далі `profiles.ts` за інтерфейсом.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/db/schema.ts apps/server/drizzle apps/server/src/profiles.ts apps/server/src/profiles.test.ts apps/server/src/db/schema.test.ts
git commit -m "feat(server): profile and follow tables, default unique nicknames"
```

---

### Задача 3. Статистика й ачівки з історії

**Files:**
- Create: `apps/server/src/achievements.ts`, `apps/server/src/achievements.test.ts`
- Modify: `apps/server/src/history.ts` (спільна вибірка ігор гравця без межі), `apps/server/src/profiles.ts` (`profileFacts`)
- Test: `apps/server/src/achievements.test.ts`, `apps/server/src/profiles.test.ts`, наявний `history.test.ts` лишається зеленим

**Interfaces:**
- Consumes: `gameStats`, `isWin`, `ACHIEVEMENTS`, `Achievement`, `ProfileStats`, `ProfileWin` (задача 1); `PENALTY_ATTEMPT` зі схеми.
- Produces (`history.ts`):
  ```ts
  export interface AnswerMark { questionIndex: number; attempt: number; accepted: boolean }
  /** Ігри гравця з акаунта, найновіші першими, з рядками його відповідей; limit null — усі. */
  export async function playerGames(db: Db, userId: string, limit: number | null): Promise<{ played: PlayedGame; marks: AnswerMark[] }[]>;
  ```
  `playerHistory(db, userId)` стає `(await playerGames(db, userId, LIMIT)).map((g) => g.played)`, відповідь та сама.
- Produces (`achievements.ts`):
  ```ts
  /** Найдовша серія зарахованих запитань у грі: запитання зараховане, якщо прийнято хоч одну спробу; штрафні рядки не рахуються; запитань без рядків немає в серії. */
  export function bestStreak(marks: AnswerMark[]): number;
  /** Завершена гра, ≥ 5 запитань з відповіддю (без штрафних рядків), жодного рядка з accepted = false, крім штрафних. */
  export function isPerfect(game: { played: PlayedGame; marks: AnswerMark[] }): boolean;
  export interface AchievementFacts { games: number; wins: number; hosted: number; bestStreak: number; perfectGames: number }
  /** Усі ачівки в порядку ACHIEVEMENTS з позначкою, чи отримано (пороги — таблиця в шапці плану). */
  export function achievementsOf(facts: AchievementFacts): Achievement[];
  ```
- Produces (`profiles.ts`):
  ```ts
  export const WINS_SHOWN = 20;
  /** Статистика, ачівки й останні перемоги (не більше WINS_SHOWN, найновіші першими). */
  export async function profileFacts(db: Db, userId: string): Promise<{ stats: ProfileStats; achievements: Achievement[]; wins: ProfileWin[] }>;
  ```
  - `games`, `wins`, `accuracy` беруться з `gameStats(всі played)`;
  - `quizzes` = `count()` з `quiz` за `owner_id`;
  - `hosted` = `count()` з `game`, де `host_id = userId` і `status = 'finished'`;
  - `wins` (перелік) — ігри з `isWin`, `rank` з `played.rank`.

- [ ] **Step 1: Write the failing tests**

```ts
// achievements.test.ts
const m = (questionIndex: number, accepted: boolean, attempt = 0) => ({ questionIndex, attempt, accepted });
it('bestStreak counts consecutive accepted questions and breaks on a wrong one', () => {
  expect(bestStreak([m(0, true), m(1, true), m(2, false), m(3, true)])).toBe(2);
  // запитання без рядка (2) не обриває: 0,1,3,4,5 зараховані → 5
  expect(bestStreak([m(0, true), m(1, true), m(3, true), m(4, true), m(5, true)])).toBe(5);
  // бліц: невдала спроба, потім вдала на тому ж запитанні — зараховане
  expect(bestStreak([m(0, true), m(1, false, 0), m(1, true, 1), m(2, true)])).toBe(3);
  // штрафний рядок не є відповіддю
  expect(bestStreak([m(0, true), m(1, false, PENALTY_ATTEMPT), m(2, true)])).toBe(2);
  expect(bestStreak([])).toBe(0);
});
it('isPerfect needs a finished game, five answered questions and no refused attempt', () => {
  // 5 прийнятих, finished → true; 4 прийнятих → false; status 'aborted' → false;
  // 5 прийнятих + m(5,false) → false; 5 прийнятих + штрафний рядок → true
});
it('achievementsOf lists all eight in order with thresholds', () => {
  expect(achievementsOf({ games: 0, wins: 0, hosted: 0, bestStreak: 0, perfectGames: 0 }).map((a) => a.earned)).toEqual(Array(8).fill(false));
  expect(achievementsOf({ games: 10, wins: 1, hosted: 1, bestStreak: 5, perfectGames: 1 }).filter((a) => a.earned).map((a) => a.id))
    .toEqual(['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host']);
  expect(achievementsOf({ games: 50, wins: 10, hosted: 0, bestStreak: 4, perfectGames: 0 }).filter((a) => a.earned).map((a) => a.id))
    .toEqual(['first_game', 'first_win', 'games_10', 'games_50', 'wins_10']);
});
// profiles.test.ts (buildApp + сценарій гри через manager, як playedGame у history.test.ts)
it('profileFacts counts played games, wins, accuracy, quizzes and hosted games', async () => {
  // ведуча з 2 вікторинами проводить гру [single, text]: Олена (акаунт) правильно обидва, Тарас (гість) помиляється
  // profileFacts(Олена) → stats { games: 1, wins: 1, accuracy: 100, quizzes: 0, hosted: 0 }, wins [{ gameId, title: 'Тестова вікторина', rank: 1 }],
  //   achievements earned: first_game, first_win
  // profileFacts(Ведуча) → stats { games: 0, wins: 0, accuracy: null, quizzes: 2, hosted: 1 }, earned: host
});
it('a game the host abandoned does not count as hosted', async () => {
  // гра, завершена через manager до кінця, має status 'finished'; гру з markInterrupted (status 'aborted') — hosted 0
});
it('profileFacts counts every game, not only the latest hundred', async () => {
  // 101 рядок participant з user_id Олени (вставити напряму в game/participant) → stats.games === 101
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server/src/achievements.test.ts apps/server/src/profiles.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `playerGames` (тіло наявного `playerHistory` з необов'язковою межею; вибірка `answer` уже бере `questionIndex`, `attempt`, `accepted`), `achievements.ts`, `profileFacts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; `history.test.ts` без змін.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): profile stats and achievements computed from the game history"
```

---

### Задача 4. Маршрути профілю: свій, публічний, зміна; приватність

**Files:**
- Create: `apps/server/src/profile-routes.ts`, `apps/server/src/profile-routes.test.ts`
- Modify: `apps/server/src/profiles.ts` (`ownProfile`, `publicProfile`, `friendsOf`, `isFollowing`), `apps/server/src/app.ts` (реєстрація)
- Test: `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Consumes: `ensureProfile`, `saveProfile`, `profileFacts` (задачі 2–3), `profileUpdateSchema`, `OwnProfile`, `PublicProfile` (задача 1), `CurrentUser` з `account-routes.ts`.
- Produces (`profiles.ts`):
  ```ts
  /** Друзі (на кого підписаний), за нікнеймом. */
  export async function friendsOf(db: Db, userId: string): Promise<ProfileCard[]>;
  export async function isFollowing(db: Db, followerId: string, followeeId: string): Promise<boolean>;
  export async function ownProfile(db: Db, user: CurrentUser): Promise<OwnProfile>;
  /** null — такого користувача немає. viewerId null — гість. */
  export async function publicProfile(db: Db, id: string, viewerId: string | null): Promise<PublicProfile | null>;
  ```
  `publicProfile` повертає об'єкт, зібраний явним переліком `{ id, nickname, avatar, stats, achievements, following }`. `following` дорівнює `null`, коли `viewerId === null` або `viewerId === id`. `ownProfile.quizzes` — `{ id, title }` з `listQuizzes(db, user.id)` у його порядку. `friendsOf` викликає `ensureProfile` для кожного друга без рядка профілю.
- Produces (`profile-routes.ts`):
  ```ts
  export interface ProfileDeps { db: Db; currentUser: (request: FastifyRequest) => Promise<CurrentUser | null> }
  export async function registerProfileRoutes(app: FastifyInstance, deps: ProfileDeps): Promise<void>;
  ```
  | Маршрут | Відповідь |
  |---|---|
  | `GET /api/me/profile` | 200 `OwnProfile`; 401 `unauthorized` |
  | `PUT /api/me/profile` (тіло `ProfileUpdate`) | 200 `ProfileCard`; 400 `nickname_invalid` (якщо `issues[0].path[0] === 'nickname'`), інакше 400 `invalid_payload`; 409 `nickname_taken`; 401 |
  | `GET /api/profiles/:id` | 200 `PublicProfile` і гостю, і з сесією; 404 `not_found` (невідомий id або довший за 64 символи) |

  `GET /api/profiles/:id` має `{ config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }`. `app.ts` викликає `registerProfileRoutes(app, { db: options.db, currentUser })` після `registerUploadRoutes`.

- [ ] **Step 1: Write the failing tests**

```ts
// profile-routes.test.ts: buildApp + signUp з testing/accounts; olena = await signUp(app, 'Олена'), id з GET /api/me
it('the owner sees email, quizzes, wins and friends', async () => {
  // Олена зберігає вікторину 'Таємна вікторина'; напряму insert follow Олена→Тарас
  // GET /api/me/profile → 200, email === olena.email, nickname 'Олена', quizzes [{ id, title: 'Таємна вікторина' }],
  //   friends [{ id: тарасId, nickname: 'Тарас', avatar: null }], achievements.length 8, stats.quizzes 1
});
it('the public profile never carries private fields, not even for its owner', async () => {
  for (const cookie of [undefined, taras.cookie, olena.cookie]) {
    const response = await get(`/api/profiles/${olenaId}`, cookie);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Object.keys(body).sort()).toEqual(['achievements', 'avatar', 'following', 'id', 'nickname', 'stats']);
    expect(Object.keys(body.stats).sort()).toEqual(['accuracy', 'games', 'hosted', 'quizzes', 'wins']);
    expect(response.body).not.toContain(olena.email);
    expect(response.body).not.toContain('Таємна вікторина');
    expect(response.body).not.toContain('Тарас'); // друг Олени
  }
});
it('following tells a signed-in visitor whether they follow, and is null for guests and the owner', async () => {
  // гість → null; Олена про себе → null; Тарас без підписки → false; insert follow Тарас→Олена → true
});
it('an unknown or removed user has no profile', async () => {
  // GET /api/profiles/nobody → 404 { error: 'not_found' }; '/api/profiles/' + 'x'.repeat(65) → 404
  // видалити user Тараса → GET його профілю 404, а friends Олени — []
});
it('the owner changes nickname and avatar', async () => {
  // PUT { nickname: '  Зірка ', avatar: '/uploads/0123456789abcdef.png' } → 200 { id, nickname: 'Зірка', avatar }
  // GET /api/profiles/<id> показує те саме
});
it('a taken or invalid nickname is refused', async () => {
  // Тарас PUT { nickname: 'зірка', avatar: null } → 409 { error: 'nickname_taken' }
  // PUT { nickname: 'З', avatar: null } → 400 { error: 'nickname_invalid' }
});
it('a foreign avatar address is refused', async () => {
  // PUT { nickname: 'Зірка', avatar: 'https://evil.example/x.png' } → 400 { error: 'invalid_payload' }; профіль без змін
});
it('own profile and changes need a session', async () => {
  // GET /api/me/profile без cookie → 401; PUT без cookie → 401
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server/src/profile-routes.test.ts`
Expected: FAIL (404 на маршрути).

- [ ] **Step 3: Implement** функції в `profiles.ts`, `profile-routes.ts`, реєстрацію в `app.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): own and public profile routes, public part never carries private fields"
```

---

### Задача 5. Друзі: підписка, відписка й пошук за нікнеймом

**Files:**
- Modify: `apps/server/src/profile-routes.ts`, `apps/server/src/profiles.ts` (`findByNickname`, `setFollow`)
- Test: `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Consumes: `nicknameKey`, `ensureProfile`, `friendsOf` (задачі 2, 4).
- Produces (`profiles.ts`):
  ```ts
  /** Профіль за точним нікнеймом (через nickname_key); null — немає. */
  export async function findByNickname(db: Db, nickname: string): Promise<ProfileCard | null>;
  /** Підписує або відписує; повторна дія нічого не змінює. */
  export async function setFollow(db: Db, followerId: string, followeeId: string, on: boolean): Promise<void>;
  ```
- Produces (маршрути):
  | Маршрут | Відповідь |
  |---|---|
  | `GET /api/profiles?nickname=<текст>` | 200 `ProfileCard`; 404 `not_found`; 400 `invalid_payload` (немає параметра або довший за 100); 401 без сесії; ліміт 30 за хвилину з ключем `find:<userId>` |
  | `PUT /api/me/friends/:id` | 204; 400 `self_follow`; 404 `not_found` (немає такого користувача); 401 |
  | `DELETE /api/me/friends/:id` | 204 (і коли підписки не було); 401 |

- [ ] **Step 1: Write the failing tests**

```ts
it('finds a profile by its exact nickname only', async () => {
  // Тарас зберіг нікнейм 'Тарас К'; Олена GET /api/profiles?nickname=%20тарас%20%20к%20 → 200 { id: тарасId, nickname: 'Тарас К', avatar: null }
  // ?nickname=Тарас → 404; без параметра → 400; без cookie → 401
});
it('a signed-in user adds and removes a friend, one-way and without confirmation', async () => {
  // Олена PUT /api/me/friends/<тарасId> → 204; ще раз → 204
  // GET /api/me/profile Олени: friends [Тарас К]; Тараса: friends []
  // GET /api/profiles/<тарасId> з cookie Олени: following true
  // DELETE → 204; friends []; DELETE ще раз → 204
});
it('nobody can follow themselves or a missing user', async () => {
  // PUT /api/me/friends/<олена id> від Олени → 400 { error: 'self_follow' }; PUT /api/me/friends/nobody → 404
  // PUT без cookie → 401
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/server/src/profile-routes.test.ts`
Expected: FAIL (нові тести).

- [ ] **Step 3: Implement** `findByNickname` (стискання й `nicknameKey` над параметром; власних профілів без рядка пошук не бачить: у таблиці лише ті, хто вже з'являвся), `setFollow` (`insert … onConflictDoNothing()` / `delete`), маршрути.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src
git commit -m "feat(server): one-way friends and exact nickname lookup"
```

---

### Задача 6. Меню: рядок угорі, панель унизу, без меню на екранах гри

**Files:**
- Create: `apps/web/src/AppRoutes.tsx`, `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/menu/WithMenu.tsx`, `apps/web/src/pages/HistoryTabs.tsx`
- Modify: `apps/web/src/main.tsx` (рендерить `<AppRoutes />` у `BrowserRouter`), `apps/web/src/useAccount.ts`, `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/Home.test.tsx`, `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/History.tsx`, `apps/web/src/pages/MyGames.tsx`, `apps/web/src/pages/History.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Produces:
  ```ts
  // useAccount.ts
  /** Хто увійшов. Запитує сервер під час появи й щоразу, коли змінюється refresh; до відповіді лишає попередній стан. */
  export function useAccount(refresh?: unknown): AccountState;
  // menu/Menu.tsx
  export function Menu(): JSX.Element; // <nav className="menu" aria-label="Меню">, useAccount(useLocation().key)
  // menu/WithMenu.tsx
  export function WithMenu(): JSX.Element; // <div className="with-menu"><Menu /><Outlet /></div>
  // AppRoutes.tsx
  export function AppRoutes(): JSX.Element; // усі наявні <Route> з main.tsx; /play, /host, /stage — поза <Route element={<WithMenu />}>
  // pages/HistoryTabs.tsx
  export function HistoryTabs(): JSX.Element; // NavLink «Проведені» → /history, «Зіграні» → /me
  ```
  Маршрути `/profile` і `/profile/:id` додає задача 7/8. У цій задачі `/profile` під `WithMenu` веде на `<Navigate to="/me" replace />`-заглушку, яку задача 8 замінює на сторінку.
- Пункти меню (у `Menu`). Посилання з `aria-current="page"` для активного розділу, перед підписом іконка `<span aria-hidden="true">`:
  | Підпис (i18n) | Іконка | Куди | Активний на |
  |---|---|---|---|
  | `menuJoin` «Приєднатися» | 🎮 | `/` | `/` |
  | `menuQuizzes` «Мої вікторини» | 📝 | `/quizzes` | `/quizzes*` |
  | `menuHistory` «Історія» | 🕘 | `/history` | `/history*`, `/me` |
  | `menuProfile` «Профіль» | 👤 | `/profile` | `/profile*` |
  | `menuSignIn` «Увійти» | 🔑 | `/login?next=<encodeURIComponent(pathname)>` | `/login` |

  Стан `signed-in` дає чотири перші, `anonymous` — «Приєднатися» й «Увійти», `loading`/`unknown` — лише «Приєднатися».
- Нові тексти: `menuLabel: 'Меню'`, `menuJoin`, `menuQuizzes`, `menuHistory`, `menuProfile`, `menuSignIn` (як у таблиці), `historyTabHosted: 'Проведені'`, `historyTabPlayed: 'Зіграні'`.
- Стилі:
  - `.menu` — рядок угорі (sticky, `top: 0`, тло `var(--stage)`, нижня межа `var(--line)`, активний пункт `var(--amber)`);
  - `@media (max-width: 700px)` — `position: fixed; bottom: 0`, пункти рівними стовпчиками, іконка над підписом, нижній відступ `env(safe-area-inset-bottom)`;
  - `.with-menu .app` на телефоні отримує додатковий нижній відступ на висоту панелі.
- Сторінки:
  - `Home` для того, хто увійшов, більше не показує панель «Мої вікторини / Мої ігри», а для відвідувача лишає «Я ведучий»;
  - `Quizzes` втрачає посилання «Історія ігор» і «Мої ігри» в панелі (кнопка «Вийти» поки лишається, до задачі 8);
  - `History` і `MyGames` замість шапки з посиланням назад показують `<HistoryTabs />`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Menu.test.tsx (vi.mock('../api', () => ({ me: vi.fn() })); рендер <MemoryRouter initialEntries={[path]}><Routes><Route element={<WithMenu />}>…</Route></Routes></MemoryRouter>)
const items = () => within(screen.getByRole('navigation', { name: 'Меню' })).getAllByRole('link').map((l) => l.textContent);
it('a visitor sees only join and sign in, and sign in returns to the page', async () => {
  // me → unauthorized; шлях /history/abc → await items() toEqual ['🎮Приєднатися', '🔑Увійти'] (іконка + підпис)
  // href «Увійти» === '/login?next=%2Fhistory%2Fabc'
});
it('a signed-in person sees join, quizzes, history and profile with the current one marked', async () => {
  // me → ok; шлях /me → посилання Приєднатися, Мої вікторини, Історія, Профіль з href '/', '/quizzes', '/history', '/profile'
  // getByRole('link', { name: 'Історія' }).getAttribute('aria-current') === 'page'; 'Профіль' — null
});
it('while it is unknown who is here, only join is offered', async () => {
  // me — проміс, що не вирішується → items() toEqual ['🎮Приєднатися']
});
it('the menu follows sign-in and sign-out without a reload', async () => {
  // me спершу unauthorized; маршрут /login містить кнопку-заглушку, що робить navigate('/quizzes');
  // після першої відповіді me → ok; натиснути кнопку → у меню з'являється «Профіль» (findByRole)
  // me → unauthorized; перехід ще раз → знову лише «Приєднатися», «Увійти»
});
// AppRoutes.test.tsx: vi.mock кожної сторінки з './pages/*' на <p>назва</p>; vi.mock('./api', () => ({ me: vi.fn() }))
it.each(['/play/123456', '/host/123456', '/stage/123456'])('a game screen %s has no menu', async (path) => {
  // render <MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>; await сторінку-заглушку;
  // screen.queryByRole('navigation', { name: 'Меню' }) === null
});
it.each(['/', '/login', '/quizzes', '/quizzes/new', '/history', '/history/g1', '/me', '/profile'])('the page %s has the menu', async (path) => {
  // getByRole('navigation', { name: 'Меню' }) є
});
// Home.test.tsx: тест «offers the quiz list and played games…» замінити на
it('does not repeat the menu links for a signed-in person', async () => {
  // me → ok; після завантаження немає посилань «Мої вікторини», «Мої ігри», «Я ведучий»
});
// History.test.tsx: перевірки посилань «Мої вікторини» / «Історія ігор» у шапці замінити на
it('switches between hosted and played games', () => {
  // посилання «Проведені» → '/history' з aria-current 'page'; «Зіграні» → '/me'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web`
Expected: FAIL (нових модулів немає, змінені тести Home/History червоні).

- [ ] **Step 3: Implement** `useAccount(refresh)` (залежність ефекту — `refresh`; стан `loading` лише до першої відповіді), `Menu`, `WithMenu`, `AppRoutes`, `HistoryTabs`, правки сторінок, тексти, стилі.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): navigation menu on every page except the game screens"
```

---

### Задача 7. Спільні частини профілю й публічна сторінка з «Додати в друзі»

**Files:**
- Modify: `apps/web/src/api.ts`, `apps/web/src/AppRoutes.tsx` (`/profile/:id` під `WithMenu`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Create: `apps/web/src/profile/Avatar.tsx`, `apps/web/src/profile/StatsView.tsx`, `apps/web/src/profile/AchievementList.tsx`, `apps/web/src/profile/profile.test.tsx`
- Create: `apps/web/src/pages/PublicProfile.tsx`, `apps/web/src/pages/PublicProfile.test.tsx`
- Test: `apps/web/src/api.test.ts`

**Interfaces:**
- Consumes: типи задачі 1; маршрути задач 4–5.
- Produces (`api.ts`):
  ```ts
  export const getMyProfile = () => fetchData<OwnProfile>('/api/me/profile');
  export const saveMyProfile = (update: ProfileUpdate) => fetchData<ProfileCard>('/api/me/profile', { method: 'PUT', body: update });
  export const getProfile = (id: string) => fetchData<PublicProfile>(`/api/profiles/${encodeURIComponent(id)}`);
  export const findProfile = (nickname: string) => fetchData<ProfileCard>(`/api/profiles?nickname=${encodeURIComponent(nickname)}`);
  export const follow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'PUT' });
  export const unfollow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'DELETE' });
  ```
  `PUT` без тіла: `call` для `method: 'PUT'` без `body` надсилає без `content-type` (так уже працює `DELETE`). Тест в `api.test.ts` це закріплює.
- Produces (компоненти):
  ```tsx
  /** Аватар: зображення або перша літера нікнейма на тлі одного з чотирьох токенів (за id). */
  export function Avatar({ profile, size }: { profile: ProfileCard; size: 'large' | 'small' }): JSX.Element;
  /** П'ять чисел у наявних стилях .stats/.stat. */
  export function StatsView({ stats }: { stats: ProfileStats }): JSX.Element;
  /** Усі ачівки; неотримані — 🔒 і клас locked. */
  export function AchievementList({ achievements }: { achievements: Achievement[] }): JSX.Element;
  ```
  - `Avatar` з картинкою: `<img src={avatar} alt={t('avatarOf', { nickname })}>`. Без картинки: `<span role="img" aria-label=…>` з `nickname[0].toUpperCase()` (перший символ за `Array.from`, щоб емодзі не розривалися) і класом `avatar-tone-${n}`, де `n` — сума кодів символів id mod 4. Класи `avatar-tone-0..3` фарбують тло в `var(--amber)`, `var(--correct)`, `var(--signal)`, `var(--pending)`, а текст — у `var(--stage)`.
  - `StatsView` рядки:
    - `games` → `countText('statGames', n)`;
    - `wins` → `countText('statWins', n)`;
    - `accuracy` → `'–'` або `${n}%` і `t('statAccuracy')`;
    - `quizzes` → `countText('statQuizzes', n)`;
    - `hosted` → `countText('statHosted', n)`.
  - `AchievementList`: `<ul className="achievements">`, кожен `li` має `title={t(\`achievementHint_${id}\`)}`. Отримана ачівка: іконка + `t(\`achievement_${id}\`)`. Заблокована: `🔒` + назва, клас `locked`, `aria-label` = `t('achievementLocked', { name })`. Іконки:
    | Ачівка | Іконка |
    |---|---|
    | `first_game` | 🎮 |
    | `first_win` | 🏆 |
    | `games_10` | 🎯 |
    | `streak_5` | 🔥 |
    | `perfect_game` | 💎 |
    | `host` | 🎤 |
    | `games_50` | 🏅 |
    | `wins_10` | 👑 |
- Produces (сторінка): `PublicProfile` на `/profile/:id`.
  - Зверху: аватар, нікнейм, рядок `t('emailHidden')`.
  - Кнопки за `following`:
    - `false` — кнопка «Додати в друзі» (`follow`, потім стан `true`);
    - `true` — текст «У друзях» і кнопка «Прибрати з друзів» (`unfollow`);
    - `null` для відвідувача без акаунта (за `useAccount`) — посилання «Увійдіть, щоб додати в друзі» на `/login?next=/profile/<id>`;
    - `null` для власника — посилання «Це ваш профіль» на `/profile`.
  - Далі «Статистика» (`StatsView`) і «Ачівки» (`AchievementList`).
  - 404 → текст `t('profileNotFound')`, інші помилки → `errorText`.
- Нові тексти:
  ```ts
  statQuizzes_one: 'вікторина', statQuizzes_few: 'вікторини', statQuizzes_many: 'вікторин',
  statHosted_one: 'проведена гра', statHosted_few: 'проведені гри', statHosted_many: 'проведених ігор',
  statsTitle: 'Статистика', achievementsTitle: 'Ачівки',
  achievement_first_game: 'Перша гра', achievement_first_win: 'Перша перемога', achievement_games_10: '10 ігор',
  achievement_streak_5: 'Серія 5 правильних поспіль', achievement_perfect_game: 'Ідеальна гра', achievement_host: 'Ведучий',
  achievement_games_50: '50 ігор', achievement_wins_10: '10 перемог',
  achievementHint_first_game: 'Зіграти першу гру з акаунта', achievementHint_first_win: 'Посісти перше місце в грі',
  achievementHint_games_10: 'Зіграти 10 ігор', achievementHint_streak_5: 'Відповісти правильно на 5 запитань поспіль в одній грі',
  achievementHint_perfect_game: 'Гра без жодної помилки, щонайменше 5 запитань', achievementHint_host: 'Провести першу гру',
  achievementHint_games_50: 'Зіграти 50 ігор', achievementHint_wins_10: 'Перемогти 10 разів',
  achievementLocked: '{name} (ще не отримано)', avatarOf: 'Аватар {nickname}', emailHidden: 'email приховано',
  addFriend: 'Додати в друзі', inFriends: 'У друзях', removeFriend: 'Прибрати з друзів',
  signInToFollow: 'Увійдіть, щоб додати в друзі', thisIsYou: 'Це ваш профіль', profileNotFound: 'Такого профілю немає.',
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// profile.test.tsx
it('Avatar shows the picture or the first letter', () => {
  // { id: 'u1', nickname: 'зірка', avatar: '/uploads/0123456789abcdef.png' } → img alt 'Аватар зірка' src '/uploads/…'
  // avatar null → getByRole('img', { name: 'Аватар зірка' }).textContent === 'З'; клас avatar-tone-<0..3>
  // nickname '🙂 Оля' → textContent '🙂'
});
it('StatsView shows five numbers with the right word forms', () => {
  // { games: 1, wins: 2, accuracy: null, quizzes: 5, hosted: 1 } → тексти '1 гра'… перевірити через .stat: 'гра', 'перемоги', '–', 'вікторин', 'проведена гра'
});
it('AchievementList shows earned and locked achievements', () => {
  // [{ id: 'first_game', earned: true }, { id: 'wins_10', earned: false }] → 'Перша гра' з 🎮; li з aria-label '10 перемог (ще не отримано)', клас locked, 🔒
});
// PublicProfile.test.tsx (vi.mock('../api', () => ({ me, getProfile, follow, unfollow })))
it('shows a public profile without email and adds to friends', async () => {
  // getProfile → { id: 'u2', nickname: 'Тарас', avatar: null, stats, achievements, following: false }; me → u1
  // видно 'Тарас', 'email приховано', 'Статистика', 'Ачівки'; клік 'Додати в друзі' → follow('u2'), видно 'У друзях' і 'Прибрати з друзів'
  // клік 'Прибрати з друзів' → unfollow('u2'), знову 'Додати в друзі'
});
it('a visitor is asked to sign in to follow', async () => {
  // me unauthorized, following null → посилання 'Увійдіть, щоб додати в друзі' href '/login?next=%2Fprofile%2Fu2'; кнопки немає
});
it('the owner sees a link to their own profile instead of the button', async () => {
  // me → u2, following null → посилання 'Це ваш профіль' href '/profile'
});
it('an unknown profile says so', async () => {
  // getProfile → { ok: false, error: 'not_found' } → 'Такого профілю немає.'
});
// api.test.ts
it('follow sends PUT without a body and unfollow sends DELETE', async () => {
  // fetch mock: follow('u 2') → fetch('/api/me/friends/u%202', { method: 'PUT', headers: undefined, body: undefined }); unfollow → 'DELETE'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement** функції API, компоненти, сторінку, маршрут, тексти, стилі:
  - `.avatar` (коло; `large` 4.5rem, `small` 2.25rem; `object-fit: cover`);
  - `.achievements` (рядок з переносом; `.locked` з `opacity` як у макеті);
  - `.profile-head` (аватар поруч з нікнеймом, як у макеті).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): public profile with stats, achievements and add to friends"
```

---

### Задача 8. Мій профіль: зміна нікнейма й аватара, вікторини, перемоги, друзі

**Files:**
- Create: `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/Profile.test.tsx`, `apps/web/src/profile/ProfileEditor.tsx`, `apps/web/src/profile/AddFriend.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (`/profile` → `<Profile />` замість заглушки), `apps/web/src/pages/Quizzes.tsx` (прибрати шапку з «Вийти»), `apps/web/src/pages/Quizzes.test.tsx` (якщо перевіряє «Вийти»), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `getMyProfile`, `saveMyProfile`, `findProfile`, `follow`, `uploadImage`, `signOut` з `api.ts`; `Avatar`, `StatsView`, `AchievementList` (задача 7); `usePrivateData` (ключ перезавантаження — лічильник після змін); `formatDate`.
- Produces:
  ```tsx
  /** Форма «Змінити нікнейм / аватар»: поле нікнейма, вибір файлу (як ImageField: типи й розмір з IMAGE_LIMITS), «Прибрати аватар», «Зберегти», «Скасувати». */
  export function ProfileEditor({ profile, onSaved, onCancel }: { profile: ProfileCard; onSaved: () => void; onCancel: () => void }): JSX.Element;
  /** Поле «Нікнейм друга» і «Додати»: findProfile, потім follow, потім onAdded. */
  export function AddFriend({ onAdded }: { onAdded: () => void }): JSX.Element;
  export function Profile(): JSX.Element; // /profile; без сесії → <Navigate to="/login?next=%2Fprofile" replace />
  ```
  Порядок розділів як у макеті:
  1. шапка: `Avatar large`, нікнейм, email, кнопка «Змінити нікнейм / аватар» (відкриває `ProfileEditor` на місці шапки), посилання «Мій публічний профіль» → `/profile/<id>`;
  2. «Статистика»;
  3. «Ачівки»;
  4. «Мої вікторини»: посилання `назва →` на `/quizzes/<id>`, порожньо → `t('noQuizzesYet')`;
  5. «Перемоги»: рядки `${formatDate(startedAt)} — «${title}», ${t('place', { rank })}`, порожньо → `t('noWinsYet')`;
  6. «Друзі»: `Avatar small` + нікнейм, кожен — посилання на `/profile/<id>`, потім `AddFriend`;
  7. кнопка «Вийти» (`signOut`, потім `navigate('/')`).

  Помилки:
  - у `ProfileEditor` — `errorText` (`nickname_taken`, `nickname_invalid`, `bad_image`, `too_large` уже мають тексти);
  - у `AddFriend`: `not_found` → `t('friendNotFound')`, `self_follow` → `t('err_self_follow')`, інші → `errorText`.
- Нові тексти:
  ```ts
  profileTitle: 'Профіль', editProfile: 'Змінити нікнейм / аватар', profileNickname: 'Нікнейм', avatarPick: 'Вибрати аватар',
  avatarRemove: 'Прибрати аватар', publicProfileLink: 'Мій публічний профіль',
  myQuizzesTitle: 'Мої вікторини', noQuizzesYet: 'Вікторин поки немає.', winsTitle: 'Перемоги', noWinsYet: 'Перемог поки немає.', friendsTitle: 'Друзі',
  noFriendsYet: 'Друзів поки немає.', friendNickname: 'Нікнейм друга', addFriendButton: 'Додати друга',
  friendNotFound: 'Гравця з таким нікнеймом не знайдено.', err_self_follow: 'Себе додати в друзі не можна.',
  ```
  «Зберегти» й «Скасувати» беруться з наявних ключів `save` і `cancel`.

- [ ] **Step 1: Write the failing tests**

```tsx
// Profile.test.tsx (vi.mock('../api', ...): me, getMyProfile, saveMyProfile, findProfile, follow, uploadImage, signOut)
const mine: OwnProfile = {
  id: 'u1', nickname: 'Олена', avatar: null, email: 'o@example.com',
  stats: { games: 3, wins: 1, accuracy: 68, quizzes: 1, hosted: 0 },
  achievements: ACHIEVEMENTS.map((id) => ({ id, earned: id === 'first_game' })),
  quizzes: [{ id: 'q1', title: 'Кіно 90-х' }],
  wins: [{ gameId: 'g1', title: 'Кіно 90-х', startedAt: '2026-10-12T15:30:00.000Z', rank: 1 }],
  friends: [{ id: 'u2', nickname: 'Тарас', avatar: null }],
};
it('shows the sections of the agreed layout in order', async () => {
  // заголовки розділів у порядку: Статистика, Ачівки, Мої вікторини, Перемоги, Друзі
  // 'o@example.com' видно; посилання 'Кіно 90-х →' href '/quizzes/q1'; текст '12.10.2026 — «Кіно 90-х», 1 місце' (формат formatDate)
  // посилання 'Тарас' href '/profile/u2'; 'Мій публічний профіль' href '/profile/u1'
});
it('changes the nickname and the avatar', async () => {
  // клік 'Змінити нікнейм / аватар'; поле 'Нікнейм' = 'Зірка'; вибрати файл png → uploadImage → { ok: true, url: '/uploads/0123456789abcdef.png' }
  // 'Зберегти' → saveMyProfile({ nickname: 'Зірка', avatar: '/uploads/0123456789abcdef.png' }); getMyProfile викликано вдруге
});
it('shows a taken nickname and keeps the form open', async () => {
  // saveMyProfile → { ok: false, error: 'nickname_taken' } → alert 'Таке ім’я вже зайняте. Виберіть інше.'; поле 'Нікнейм' лишається
});
it('removes the avatar', async () => {
  // профіль з avatar; 'Змінити…' → 'Прибрати аватар' → 'Зберегти' → saveMyProfile({ nickname: 'Олена', avatar: null })
});
it('adds a friend by nickname and explains an unknown one', async () => {
  // findProfile → { ok: false, error: 'not_found' }: 'Нікнейм друга' = 'Хтось', 'Додати друга' → alert 'Гравця з таким нікнеймом не знайдено.'; follow не викликано
  // findProfile → { ok: true, data: { id: 'u3', … } } → follow('u3'), getMyProfile викликано знову
});
it('signs out from the profile', async () => {
  // клік 'Вийти' → signOut викликано, перехід на '/'
});
it('sends a visitor to sign in', async () => {
  // me → unauthorized → сторінка входу з next=%2Fprofile
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web`
Expected: FAIL.

- [ ] **Step 3: Implement** `ProfileEditor`, `AddFriend`, `Profile`, маршрут, прибрати шапку з «Вийти» в `Quizzes.tsx` (ім'я акаунта й вихід тепер у профілі), тексти, стилі (розділи профілю — `.panel` з `h2`, як решта сайту).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): my profile with nickname and avatar, quizzes, wins and friends"
```

---

### Задача 9. Наскрізний сценарій: меню, профіль, друзі

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it` з наявними `open`, `click`, `field`, `join`, `snapshot`, `shot`)

**Interfaces:**
- Consumes: усе з задач 1–8; `makeQuiz`, `single` з `@quiz/engine/testing` для вікторини, збереженої через `page.request.post('/api/quizzes', { data })` (кукі контексту ведучого).

- [ ] **Step 1: Write the scenario** `it('the menu stays off the game screens; a player’s profile counts the game, changes nickname and avatar, and gets a friend', …)` з обгорткою `try … catch { await snapshot(); throw }`, як у наявних:
  1. **Відвідувач на телефоні.** `open('visitor', 390, 844)`, `goto(base)`. `nav[aria-label="Меню"]` має рівно посилання «Приєднатися» й «Увійти». Його `boundingBox().y + height` ≈ висоті вікна (панель унизу). `shot`.
  2. **Ведуча на комп'ютері** (1280×900) реєструється через «Я ведучий» → «Створити акаунт», як у першому сценарії. У меню чотири посилання: «Приєднатися», «Мої вікторини», «Історія», «Профіль». `boundingBox().y` ≈ 0 (рядок угорі). Далі вона:
     - зберігає `makeQuiz([single], { speedBonus: false })` через `page.request` і перезавантажує `/quizzes`;
     - натискає «Грати»;
     - на `/host/<код>` меню немає (`nav[aria-label="Меню"]` має count 0), так само на сцені (посилання «Відкрити сцену»).
  3. **Гравець на телефоні** (390×844) у меню натискає «Увійти» → «Створити акаунт» (ім'я «Оля Гравець») і повертається з меню на «Приєднатися». Гість «Тарас» приєднується без акаунта (`join`). На екрані гравця меню немає.
  4. **Гра.** Ведуча стартує. Оля вибирає правильний варіант `single`, Тарас — неправильний. Ведуча доводить гру до кінця.
  5. **Профіль Олі.** Вона натискає «Профіль» у меню й бачить:
     - у статистиці «1 гра», «1 перемога», «100%»;
     - отримані «Перша гра» й «Перша перемога», заблоковану «10 ігор» (`aria-label` «10 ігор (ще не отримано)»);
     - перемогу «— «Тестова вікторина», 1 місце».

     Потім «Змінити нікнейм / аватар»: нікнейм «Зірка», файл `PIXEL` (`.profile-editor input[type=file]`), «Зберегти». Відтак видно «Зірка» й `img` з alt «Аватар Зірка». Вона переходить за «Мій публічний профіль» і запам'ятовує `page.url()`.
  6. **Ведуча** відкриває ту адресу:
     - видно «Зірка», «email приховано», а адреси Олі на сторінці немає (`page.content()` не містить її email);
     - «Додати в друзі» → «У друзях»;
     - у меню «Профіль»: у статистиці «1 проведена гра», отримано «Ведучий», у «Друзі» посилання «Зірка», яке відкриває публічний профіль.
  7. **Приватність через браузер ведучої.** `page.request.get('/api/profiles/<id Олі>')` повертає JSON без ключів `email`, `quizzes`, `friends`, `wins`.
  8. В кінці `expect(problems).toEqual([])`, як у наявних сценаріях.

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm build` і потім `npx vitest run --config apps/server/e2e/vitest.config.ts`
Expected: усі сценарії PASS, включно з наявними (вони спираються на «Я ведучий», «Нова вікторина», «Відкрити сцену», які лишилися).

- [ ] **Step 3: Run the unit suite**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: menu, profile and friends end-to-end"
```
