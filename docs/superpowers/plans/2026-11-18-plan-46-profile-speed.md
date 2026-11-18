# План 46: швидкий профіль

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Стан гри не змінюється. **Міграцій немає.** Жодне число, яке бачить людина (статистика, ачівки, перемоги, історія, «Ви й він»), не змінюється — це перевіряє «золотий» тест задачі 1, який наступні задачі **не мають права оновлювати**.

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`9dc83a43`, після плану 45):
> - `playerGames(db, userId, limit)` — `apps/server/src/history.ts` ~936: `db.select({ participant, game })` (увесь рядок гри, разом з `quiz_snapshot` і `plays`), далі `rivalCounts` (~498), імена команд і рядки `answer` — послідовно; `questionsPlayed` = `game.questionsPlayed − unscoredPlayed − unplayedWipeout − unplayedSurvival − unplayedTruth − unplayedLadder` (~851–934);
> - що саме з `quiz_snapshot` / `plays` читають ці функції:
>   - `unscoredPlayed` (~851) — сирий `snapshot.rounds[ref.roundIndex].questions[]` → `{ id, type }` першого з `id === ref.questionId` (`isUnscored` — лише `type`; ще `type === 'think'`); `plays[].roundIndex`, `plays[].questionId`; старий формат без `rounds` → 0; **клітинки поля (`categories`) не дивиться**;
>   - `unplayedTruth` (~931) — лише `plays[].truth.actor`;
>   - `unplayedWipeout` / `unplayedSurvival` / `unplayedLadder` (~871/897/919) — ворота: сирий `rounds[].type` містить `'wipeout'` / `'survival'` / `'ladder'`; лише тоді `snapshotOf(snapshot)` (`upgradeQuiz` + повний `quizSchema.safeParse`, ~67; провал → 0), `questionOf(quiz, ref).points`, `plays[].wipeout.took`, `plays[].survival.trial.out`, `plays[].ladder.contestant`; **кожна з трьох розбирає знімок окремо** (до трьох повних розборів zod на гру);
> - хто кличе `playerGames`: `careerInputs` (`apps/server/src/achievement-store.ts` ~50), `playerHistory` (`history.ts` ~1061 → `GET /api/me/history`, `account-routes.ts` ~277, сторінка `MyGames.tsx`), `finishedGames` у `apps/server/src/versus.ts` ~24 (`GET /api/me/versus/:id`, `VersusBlock.tsx` — двічі: для обох людей);
> - `careerInputs` → `playerGames` + два `count` + `gameTables` (`history.ts` ~1110: типи раундів уже в SQL `jsonb_path_query_array`, повний знімок — лише для «нечитаних» старих; учасники й усі рядки `answer` усіх ігор — ~5.7 тис. рядків для власника);
> - `syncAchievements(db, userId, at, options)` (~323) — на кожному читанні: `storedOf`, `careerInputs` (якщо не `prepared`), `careerCounts` (~94, сім послідовних запитів, разом з `answeredTypes` для свого профілю без `all_types`), `missedGames` (~260, три послідовні запити), вставка лише відсутніх. Хто кличе: `profileFacts` (`apps/server/src/profiles.ts` ~120, з `prepared`), `achievementsPage` (~483), `awardGame` (фініш гри, `at` ≠ null), `group-routes.ts` ~97 (запис групи, «Літописець»);
> - `profileFacts` кличуть `ownProfile` (~233, `GET /api/me/profile`) і `publicProfile` (~255, `GET /api/profiles/:id`); `achievementsPage` — `GET /api/me/achievements` і `GET /api/profiles/:id/achievements` (`apps/server/src/profile-routes.ts` ~125–155). **В одному запиті кар'єра вже читається раз** (`prepared`); «кілька разів» — це кілька запитів сторінок: профіль, ачівки, «Ви й він», підсторінки профілю;
> - XP (`ownLevel`/`publicLevel` → `synced`, `apps/server/src/xp-store.ts` ~345) читає `user_achievement` — тому рівень **після** синхронізації ачівок, порядок лишається;
> - веб: `useMyProfile` (`apps/web/src/profile/useMyProfile.ts`) — `usePrivateData(getMyProfile)` у `Profile.tsx` і кожній підсторінці (`pages/profile/ProfileStats|ProfileQuizzes|ProfileLikes|ProfileLooks|ProfileSettings.tsx`, `Prizes.tsx`, `PrizeStudioPage.tsx`): кожен перехід — новий повний `GET /api/me/profile` і екран «Завантаження»; `PublicProfile.tsx` — `getProfile(id)` + `VersusBlock` (`getVersus`); `Achievements.tsx` — `getMyAchievements` / `getAchievements(id)`;
> - тести-зразки: `apps/server/src/history.test.ts` (кожне коригування `questionsPlayed`: думай інакше ~2787, правда ~2674, ва-банк ~2109, вибування ~2178, мільйонер ~2254, опитування/хмара ~1826), `apps/server/src/profiles.test.ts`, `apps/server/src/achievement-store.test.ts`; фікстури — `seedGame` (`apps/server/src/testing/history-rows.ts`), `makeQuiz`/`single` (`@quiz/engine/testing`), база — `createTestDb()` (`apps/server/src/testing/test-db.ts`, PGlite).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** `GET /api/profiles/:id`, `/api/profiles/:id/achievements`, `/api/me/profile`, `/api/me/achievements` для користувача з 26 завершеними іграми — помітно менше 200 мс на сервері (зараз 0.7–1.1 с), без жодної зміни чисел і без поломки історії та «Ви й він».

**Архітектура:** (1) «золотий» тест і SQL-шпигун на засіяній кар'єрі з 26 ігор + скрипт вимірювання; (2) `playerGames` читає вузькі стовпці й **тонку проєкцію** знімка/журналу, зібрану в SQL, а повний знімок — лише для ігор з «Ва-банк»/«Вибуванням»/«Мільйонером», і розбирає його раз; (3) незалежні запити читання — паралельно, `profileFacts` бере входи з `syncAchievements`; (4) веб тримає останній свій профіль між сторінками (показ одразу, оновлення у фоні).

**Технології:** TypeScript, Fastify + drizzle (Postgres, PGlite у тестах), Postgres jsonb, React 19 + Testing Library.

**Специфікація:** звіт власника 2026-11-18 (профіль вантажиться 2–3 с) і виміри на проді з постановки задачі; окремого документа немає.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Якщо виконавцю здасться, що потрібне інше, — **зупинитися й спитати контролера**.
- **Без міграцій.** Якщо здасться, що без нової колонки не обійтись, — зупинитися й спитати (дозволено лише адитивну).
- **Жодних змін поведінки й чисел.** Знімок «золотого» тесту (`apps/server/src/__snapshots__/profile-speed.test.ts.snap`), записаний у задачі 1, у задачах 2–5 **не оновлюється** (`-u` заборонено); наявні тести історії, профілю й ачівок не правляться, крім явно названих у задачі.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів і збирання — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів; ніколи два запуски vitest водночас).
- Правки файлів — лише інструментами редагування; **не через python** (`python3` тут — заглушка, що нічого не робить).
- e2e-частини немає: змін інтерфейсу, крім зникнення екрана «Завантаження» між підсторінками профілю, немає.
- **Нічого, пов'язаного з росією**, — у фікстурах і назвах.
- Скрипт вимірювання **не мігрує** базу (не `connectDb`) і за замовчуванням іде на **локальну** копію, відновлену `db:restore`; на прод — лише з дозволу контролера.

## Рішення плану (там, де постановка мовчить)

**Тонка проєкція в `playerGames`** (один запит замість `select({ participant, game })`):
- стовпці учасника: `id`, `teamId`, `nickname`, `score`, `rank`; гри: `id`, `title`, `status`, `autopilot`, `startedAt`, `questionsPlayed`;
- `slimSnapshot` — SQL-вираз, що зберігає рівно ту форму, яку бачать JS-функції (позиції масивів — `with ordinality … order by`):
```sql
case when jsonb_typeof(g.quiz_snapshot -> 'rounds') = 'array' then jsonb_build_object('rounds', (
  select coalesce(jsonb_agg(case when jsonb_typeof(r) = 'object' then jsonb_build_object(
    'type', r -> 'type',
    'questions', case when jsonb_typeof(r -> 'questions') = 'array' then (
      select coalesce(jsonb_agg(case when jsonb_typeof(q) = 'object' then jsonb_build_object('id', q -> 'id', 'type', q -> 'type') else q end order by qi), '[]'::jsonb)
      from jsonb_array_elements(r -> 'questions') with ordinality as qs(q, qi)) end)
  else r end order by ri), '[]'::jsonb)
  from jsonb_array_elements(g.quiz_snapshot -> 'rounds') with ordinality as rs(r, ri)))
end
```
  (старий формат без `rounds` → SQL `null` → JS бачить `null`, як і раніше «0»; `upgradeQuiz` тут **не** застосовується — і зараз ці функції дивляться сирий знімок);
- `slimPlays` — `case when jsonb_typeof(g.plays) = 'array' then (select coalesce(jsonb_agg(case when jsonb_typeof(p) = 'object' then jsonb_build_object('roundIndex', p -> 'roundIndex', 'questionId', p -> 'questionId', 'truth', case when p ? 'truth' then jsonb_build_object('actor', p -> 'truth' -> 'actor') end) else p end order by pi), '[]'::jsonb) from jsonb_array_elements(g.plays) with ordinality as ps(p, pi) where g.questions_played < 0 or pi <= g.questions_played) else g.plays end` (зріз `slice(0, questionsPlayed)` лишається в JS — SQL лише не везе зайвого);
- `unscoredPlayed` і `unplayedTruth` працюють **без змін** на `slimSnapshot`/`slimPlays`;
- **ворота** (`rounds.some(type ∈ {wipeout, survival, ladder})`) рахуються в JS на `slimSnapshot` тим самим кодом; лише для таких ігор (`gated`) — другий запит `select { id, quizSnapshot, plays } from game where id in (gated)`, і `unplayedWipeout`/`unplayedSurvival`/`unplayedLadder` отримують **повні** сирі значення й ліниво-одноразовий розбір `onceSnapshot(raw): () => Quiz | null` (новий помічник у `history.ts`: перший виклик — `snapshotOf(raw)`, далі той самий результат). Провал розбору → 0, як і зараз.

**Паралельність читання** (порядок результатів не змінюється, лише очікування):
- `playerGames`: після рядків — `Promise.all([rivalCounts, імена команд, рядки answer, повні знімки gated])`;
- `careerInputs`: `Promise.all([playerGames, quizzes count, hosted count])`, далі `gameTables`;
- `careerCounts`: сім незалежних запитів — `Promise.all`; `missedGames`: три — `Promise.all`;
- `syncAchievements`: `Promise.all([storedOf, options.prepared ?? careerInputs])`, далі `careerCounts` (йому потрібен `earned`); повертає ще й `inputs: CareerInputs`;
- `profileFacts` більше не кличе `careerInputs` сам — бере `inputs` з результату `syncAchievements`;
- `ownProfile`: `ensureProfile` → `profileFacts` → `Promise.all([popularQuizzes, ownLevel, likeTotals, safeLeagueTitles, friendsOf, showcaseOf])`; `publicProfile`: `isBanned` → `ensureProfile` → `profileFacts` → `Promise.all([isFollowing (якщо треба), showcaseOf, antiHidden, publicLevel, likeTotals, safeLeagueTitles])`; `achievementsPage`: `syncAchievements` ‖ нічого — `antiHidden` після нього, але паралельно з побудовою не треба (він один). XP і ліга — **після** ачівок, як і зараз.

**Синхронізація на читанні лишається** (див. «Розбіжності», п. 1): вона стає дешевою, а не пропускається.

**Веб: спільний останній профіль.** У `apps/web/src/profile/useMyProfile.ts` — модульне `let shared: { accountId: string; data: OwnProfile } | null`; поки свіжий запит вантажиться, хук віддає `{ status: 'ready', data: shared.data, account }`, якщо `shared.accountId` = id поточного акаунта; готова свіжа відповідь перезаписує `shared`. `export function forgetMyProfile(): void` — для тестів і виходу з акаунта (`signOut` у `ProfileSettings.tsx` кличе його перед переходом). Запит після показу кешу все одно йде — числа оновлюються за мить.

## Порядок збирання

- Залежності: 1 — перша; 2 ← 1; 3 ← 2 (той самий `history.ts`/`achievement-store.ts`); 4 — незалежна від 2–3 (лише веб), але після 1; 5 — остання.
- Кожна задача лишає `pnpm typecheck` і «золотий» тест зеленими.

## Фокус рев'ю

1. **Точність `questionsPlayed`.** Опитування/хмара/«Думай інакше» в раунді-списку, ті самі типи **в клітинці поля** (не віднімаються — як і зараз), правда про самого гравця, ва-банк зі «Забрати», вибування, мільйонер-глядач, командна гра (рахується команда), старий знімок без `rounds`, знімок, що не проходить схему, — числа ті самі, що до плану.
2. **Ворота повного знімка.** Гра з «Ва-банк» і зіпсованим знімком → повний знімок читається, розбір провалюється → 0; гра без цих раундів повного знімка не читає ніколи (SQL-шпигун).
3. **Перше читання проти наступних.** Перше відкриття профілю (доповнення історії, `achievements_synced_at` null) і друге — однакові ачівки й дати; паралельні запити не дублюють вставок (`onConflictDoNothing` лишається).
4. **Порядок XP після ачівок.** Рівень і «щойно відкрите» читаються після синхронізації ачівок; паралельність не переставила їх.
5. **Веб-кеш і чужий акаунт.** Після виходу й входу іншою людиною її профіль не показує чужих даних ні на мить; після гри профіль спершу показує старі числа й одразу оновлюється.

---

### Задача 1. Сітка безпеки: засіяна кар'єра, «золотий» тест, SQL-шпигун і скрипт вимірювання

**Files:**
- Modify: `apps/server/src/testing/test-db.ts` (параметр `onQuery`)
- Create: `apps/server/src/testing/career-fixture.ts`, `apps/server/src/profile-speed.test.ts`, `apps/server/src/__snapshots__/profile-speed.test.ts.snap` (пише vitest), `apps/server/scripts/profile-timing.ts`
- Modify: `apps/server/package.json` (скрипт `profile:timing`)

**Interfaces:**
- Produces:
```ts
// test-db.ts
export async function createTestDb(options?: { onQuery?: (query: string, params: unknown[]) => void }): Promise<Db>; // drizzle logger: { logQuery }
// career-fixture.ts
export interface CareerFixture { userId: string; friendId: string; otherId: string; gameIds: string[]; gatedGameIds: string[]; oldFormatGameIds: string[] }
export async function seedCareer(db: Db): Promise<CareerFixture>;
// profile-speed.test.ts (локально)
function stable(value: unknown): unknown; // UUID → «<id N>» у порядку першої появи
const FULL_SNAPSHOT = /"quiz_snapshot"(\s*,|\s+from\s)/i;
const FULL_PLAYS = /"plays"(\s*,|\s+from\s)/i;
```

- [ ] **Step 1: Фікстура `seedCareer`.** Акаунти (вставкою `user`, як у `profiles.test.ts`): Оля (`userId`), Петро (`friendId`, Оля на нього підписана), Віра (`otherId`). 26 завершених ігор Олі через `seedGame` зі `startedAt` по днях від `2026-10-01T10:00:00Z`, кожен знімок — `makeQuiz` з довгим текстом запитань (~60 КБ на гру, щоб знімок був справді великим), журнал `plays` написаний руками (`PlayRef`):
  - 8 класичних ігор (`single`), правильні й ні, Петро — суперник у 5 з них, 3 перемоги Олі;
  - опитування + хмара в раунді-списку; «Думай інакше» (35); ті самі опитування **в клітинці поля** (`categories[].cells[]`);
  - «Правда про гравця» з `truth.actor` = Оля і = Петро;
  - «Ва-банк» з `wipeout.took` = [Оля] на 2-й сходинці з 4; «Вибування» з `survival.trial.out` = [Оля]; «Мільйонер», де контестант — Петро, а Оля відповіла «за себе» на одне запитання;
  - «Ва-банк» зі **зіпсованим** знімком (раунд `type: 'wipeout'`, але не проходить `quizSchema`);
  - стара гра зі знімком старого формату (`{ questions: [...] }`, без `rounds`) і `plays: []`;
  - командна гра (рядок команди `isTeam`, Оля — `teamOf`), автопілотна гра, гра з дебафом Олі (`debuff`), гра, яку Оля **вела** (не грала), гра іншої людини за вікториною Олі, гра Олі **не завершена** (`status: 'running'` — не рахується).
  - `gatedGameIds` — три «Ва-банк»/«Вибування»/«Мільйонер» + зіпсована; `oldFormatGameIds` — стара.
- [ ] **Step 2: Тест `profile-speed.test.ts`:** `vi.useFakeTimers({ toFake: ['Date'] })`, `vi.setSystemTime(new Date('2026-11-18T12:00:00Z'))`.
  - `the career numbers stay the same on the first and the next profile reads` — для `first` і `second` (два проходи підряд) збирає `{ history: playerHistory(db, userId), games: playerGames(db, userId, null), own: ownProfile(db, { id: userId, name: 'Оля', email: 'olya@example.com' }), public: publicProfile(db, userId, friendId), achievementsOwn: achievementsPage(db, userId, true), achievementsPublic: achievementsPage(db, userId, false), versus: versusOf(db, userId, friendId), facts: careerFacts(db, userId) }` і робить `expect(stable({ first, second })).toMatchSnapshot()`. Перед записом знімка виконавець **руками перевіряє** в ньому `questionsPlayed` кожної спеціальної гри (наприклад, «Думай інакше» не рахується, ва-банк — мінус дві сходинки, клітинка-опитування — рахується) і пише ці перевірки ще й явними `expect(...).toMatchObject(...)` для 6 ігор (опитування-список, поле, думай інакше, правда, ва-банк, зіпсований ва-банк).
  - `the profile never reads whole quiz snapshots or game logs except for wipeout, survival and ladder games` — після першого (прогрівного) проходу логує запити другого проходу `ownProfile`/`publicProfile`/`achievementsPage(true|false)`/`playerHistory`/`versusOf`; для кожного запиту, що збігся з `FULL_SNAPSHOT` або `FULL_PLAYS`, усі UUID-параметри мусять бути в `gatedGameIds ∪ oldFormatGameIds`. **Цей тест у задачі 1 позначити `it.fails`** (зараз `playerGames` читає все) — задача 2 знімає `.fails`.
- [ ] **Step 3: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts`. Expected: перший тест пише знімок і PASS, другий — PASS як `it.fails`.
- [ ] **Step 4: Скрипт `apps/server/scripts/profile-timing.ts`** (`pnpm --filter @quiz/server profile:timing <userId> [--runs 5]`, `tsx --env-file-if-exists=../../.env`): `createPool(DATABASE_URL)` + `drizzle(pool, { schema })` **без міграцій**; обгортає `pool.query`, записуючи SQL (перші 120 символів), мс і `rowCount`; для кожного з `publicProfile(db, id, null)`, `achievementsPage(db, id, false)`, `achievementsPage(db, id, true)`, `ownProfile(db, { id, name: '', email: '' })`, `playerHistory(db, id)` робить `--runs` проходів і друкує медіану мс, число запитів і п'ять найповільніших запитів; окремо — медіану самого `playerGames(db, id, null)` і `careerInputs(db, id)`. Першим рядком друкує `describeTarget` (як `db-restore.ts`), щоб було видно, яка база.
- [ ] **Step 5: Виміряти «до»** на локальній копії (`pnpm --filter @quiz/server db:restore --r2-latest` у порожню локальну базу, потім скрипт з id власника; id — з `memory/family-accounts.md` чи пошуком у копії) і вставити таблицю медіан у тіло коміту.
- [ ] **Step 6: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts apps/server/src/history.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 7: Commit**
```bash
git add apps/server/src/testing/test-db.ts apps/server/src/testing/career-fixture.ts apps/server/src/profile-speed.test.ts apps/server/src/__snapshots__/profile-speed.test.ts.snap apps/server/scripts/profile-timing.ts apps/server/package.json
git commit -m "test(server): 46 profile speed — a seeded 26-game career pins every profile, achievements, history and versus number on the first and the next read, an SQL spy shows the whole snapshots being read, and a timing script measures the profile endpoints on a restored copy"
```

### Задача 2. Сервер: тонкий `playerGames` (`history.ts`)

**Files:**
- Modify: `apps/server/src/history.ts` (`playerGames`, `unplayedWipeout`, `unplayedSurvival`, `unplayedLadder`, новий `onceSnapshot`)
- Test: `apps/server/src/profile-speed.test.ts` (зняти `.fails`), `apps/server/src/history.test.ts` (новий тест нижче)

**Interfaces:**
- Consumes: `seedCareer`, `createTestDb({ onQuery })` (задача 1).
- Produces (сигнатура `playerGames` і тип результату — **без змін**):
```ts
function onceSnapshot(raw: unknown): () => Quiz | null;
function unplayedWipeout(snapshot: unknown, quiz: () => Quiz | null, plays: PlayRef[] | null, questionsPlayed: number, participantId: string, accepted: Set<number>): number;
function unplayedSurvival(snapshot: unknown, quiz: () => Quiz | null, plays: PlayRef[] | null, questionsPlayed: number, participantId: string): number;
function unplayedLadder(snapshot: unknown, quiz: () => Quiz | null, plays: PlayRef[] | null, questionsPlayed: number, participantId: string, answered: Set<number>): number;
```

- [ ] **Step 1: Write the failing tests:**
  - у `profile-speed.test.ts` — прибрати `.fails` з тесту шпигуна;
  - у `history.test.ts`, новий `describe('history: slim reads (46)')`: `a game whose first poll sits in a board cell and whose snapshot is broken keeps its questions played` — одна гра з полем, де клітинка — опитування, і одна з раундом `wipeout` та зіпсованим знімком: `playerHistory` → `questionsPlayed` такі ж, як у знімку задачі 1 для аналогічних ігор (поле — без віднімання, зіпсований ва-банк — без віднімання); `a wipeout game parses its snapshot once` — `vi.spyOn` на `quizSchema.safeParse` (`@quiz/shared`) під час `playerGames` для гри з «Ва-банк», «Вибуванням» і «Мільйонером» в одному знімку → рівно 1 виклик на цю гру.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts apps/server/src/history.test.ts`. Expected: FAIL (шпигун бачить повний знімок усіх 26 ігор; розбір — тричі).
- [ ] **Step 3: Implement** за «Тонка проєкція в `playerGames`»: вузький `select` з `slimSnapshot`/`slimPlays` (SQL — як у «Рішеннях», через `sql<unknown>`), ворота на тонкому знімку, другий запит повних `quizSnapshot`/`plays` лише для `gated`, `onceSnapshot` замість окремого `snapshotOf` у трьох функціях; `unscoredPlayed` і `unplayedTruth` не змінюються. Коментарі — українською, як у файлі.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts apps/server/src/history.test.ts apps/server/src/history.facts.test.ts apps/server/src/profiles.test.ts apps/server/src/achievement-store.test.ts apps/server/src/achievements.test.ts && pnpm typecheck`. Expected: PASS, знімок задачі 1 незмінний.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/history.ts apps/server/src/history.test.ts apps/server/src/profile-speed.test.ts
git commit -m "perf(server): 46 profile speed — player games read narrow columns and a slim snapshot and log built in SQL; whole snapshots only for wipeout, survival and ladder games, parsed once per game; every number stays the same"
```

### Задача 3. Сервер: паралельне читання кар'єри й профілю

**Files:**
- Modify: `apps/server/src/history.ts` (`playerGames` — `Promise.all` після рядків), `apps/server/src/achievement-store.ts` (`careerInputs`, `careerCounts`, `missedGames`, `syncAchievements` → ще й `inputs`), `apps/server/src/profiles.ts` (`profileFacts`, `ownProfile`, `publicProfile`)
- Test: `apps/server/src/achievement-store.test.ts`, `apps/server/src/profile-speed.test.ts`

**Interfaces:**
- Consumes: тонкий `playerGames` (задача 2).
- Produces:
```ts
export async function syncAchievements(db: Db, userId: string, at: FinishedAt | null, options?: SyncOptions): Promise<{ earned: EarnedAchievements; fresh: AchievementId[]; facts: CareerFacts; inputs: CareerInputs }>;
```

- [ ] **Step 1: Write the failing tests:**
  - `achievement-store.test.ts`: `sync returns the career inputs it read, and the ones it was given` — без `prepared` → `inputs.stats.games` = числу завершених ігор; з `prepared` → `inputs` той самий об'єкт (`toBe`).
  - `profile-speed.test.ts`: `one profile request reads the player's games once` — шпигун на другому проході: у кожному з `ownProfile`, `publicProfile`, `achievementsPage(true)` рівно один запит, що містить `from "participant" inner join "game"` і `order by "game"."started_at" desc`; `the first read levels up from the achievements it just wrote` — свіжа кар'єра без `achievements_synced_at`: **перший** `ownProfile` уже показує `level` з XP за щойно доповнені ачівки (`level.progress` = тому, що дає другий виклик) — так ловиться перестановка XP перед ачівками.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/achievement-store.test.ts apps/server/src/profile-speed.test.ts`. Expected: FAIL (`inputs` немає).
- [ ] **Step 3: Implement** за «Паралельність читання»; `profileFacts` = один виклик `syncAchievements(db, userId, null, { types: own })` і `inputs` з нього; `awardGame` і `group-routes.ts` не змінюються (нове поле їм не заважає).
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts apps/server/src/achievement-store.test.ts apps/server/src/profiles.test.ts apps/server/src/profile-routes.test.ts apps/server/src/anti-achievements.test.ts apps/server/src/group-routes.test.ts apps/server/src/league-routes.test.ts && pnpm typecheck`. Expected: PASS, знімок незмінний.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/history.ts apps/server/src/achievement-store.ts apps/server/src/profiles.ts apps/server/src/achievement-store.test.ts apps/server/src/profile-speed.test.ts
git commit -m "perf(server): 46 profile speed — career, counts, missed games and profile parts are read side by side, the profile takes the career from the achievement sync instead of reading it twice; levels still come after achievements"
```

### Задача 4. Веб: останній свій профіль між сторінками (`useMyProfile.ts`)

**Files:**
- Modify: `apps/web/src/profile/useMyProfile.ts`, `apps/web/src/pages/profile/ProfileSettings.tsx` (`forgetMyProfile()` перед виходом)
- Test: `apps/web/src/profile/useMyProfile.test.tsx` (новий); у `apps/web/src/pages/profile/subpages.test.tsx`, `apps/web/src/pages/Profile.test.tsx`, `apps/web/src/pages/Prizes.test.tsx`, `apps/web/src/pages/PrizeStudioPage.test.tsx`, `apps/web/src/AppRoutes.test.tsx` — лише `beforeEach(() => forgetMyProfile())`, якщо тест падає через кеш з попереднього тесту

**Interfaces:**
- Produces: `export function forgetMyProfile(): void;` сигнатура `useMyProfile()` — без змін.

- [ ] **Step 1: Write the failing tests** (`useMyProfile.test.tsx`, `vi.mock('../api')`, `getMyProfile` — керовані проміси, акаунт — мок `me`):
  - `a second page shows the last profile at once and then the fresh one` — перший хук отримав профіль зі `stats.games = 3`, демонтувався; другий хук одразу `ready` з 3, після відповіді — 4; `getMyProfile` викликано двічі;
  - `another account never sees the cached profile` — кеш акаунта A, поточний акаунт B → `loading`, доки не прийде B;
  - `forgetMyProfile drops the cache` — після нього новий хук `loading`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/profile/useMyProfile.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Веб: спільний останній профіль».
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/profile apps/web/src/pages apps/web/src/AppRoutes.test.tsx && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/profile/useMyProfile.ts apps/web/src/profile/useMyProfile.test.tsx apps/web/src/pages/profile/ProfileSettings.tsx apps/web/src/pages apps/web/src/AppRoutes.test.tsx
git commit -m "perf(web): 46 profile speed — profile subpages show the last own profile at once and refresh it in the background; the cache belongs to one account and is dropped on sign-out"
```

### Задача 5. Перевірка й вимір «після»

**Files:** без змін коду (лише якщо вимір вимагає — див. крок 3).

- [ ] **Step 1: Run** `pnpm test --project server --maxWorkers=2`, потім `pnpm test --project web --maxWorkers=2`, потім `pnpm test --project shared --maxWorkers=2`, `pnpm test --project engine --maxWorkers=2`, `pnpm typecheck` — по черзі. Expected: усе PASS, `profile-speed.test.ts.snap` у `git status` незмінний.
- [ ] **Step 2: Виміряти «після»** тим самим скриптом на тій самій локальній копії (`pnpm --filter @quiz/server profile:timing <id> --runs 5`); порівняти з таблицею з коміту задачі 1.
- [ ] **Step 3: Рішення за виміром.** Медіани всіх чотирьох профільних запитів < 200 мс — готово. Інакше **зупинитися й доповісти контролеру** п'ять найповільніших запитів (очікуваний підозрюваний — `answeredTypes` для `/api/me/achievements`, див. «Розбіжності», п. 3) — без самовільних кешів чи міграцій.
- [ ] **Step 4:** коміту немає, якщо код не змінювався; таблицю «до/після» — у звіт контролеру.

---

## Розбіжності з постановкою (рішення плану)

1. **Синхронізацію ачівок на читанні не пропускаємо.** Кар'єрні ачівки змінюються не лише від нових ігор: підписка на друга (`friendsPlayedWith` за вже зіграними іграми), записи групи («Літописець»), чужі ігри за вікториною людини, а головне — **нові ачівки в каталозі після деплою** видаються саме першим читанням. Мітка «кар'єра не змінилась» мусила б охоплювати все це й версію каталогу — це нова колонка (міграція) і крихка логіка навколо `achievements_synced_at`, яку вже використовує `missedGames`. Замість пропуску синхронізація стає дешевою: тонкі ігри, паралельні запити, вставка — лише відсутніх (як і було). Якщо після задачі 5 цього не вистачить, — окремий план з адитивною колонкою.
2. **«Кілька разів за сторінку» — це кілька запитів, а не повтор усередині запиту.** В одному запиті кар'єра вже читалась раз (`prepared`); задача 3 лише закріплює це тестом і прибирає подвійну точку входу в `profileFacts`. Об'єднувати ендпоінти не стали: сторінки профілю, ачівок і «Ви й він» — різні адреси й різні права (свій/чужий); веб-кеш задачі 4 прибирає повтори між підсторінками свого профілю.
3. **`answeredTypes` не чіпаємо.** Він читає тип запитання з `quiz_snapshot` у SQL для кожного рядка відповіді (розпакування знімка на рядок) і потрібен лише своєму профілю й своїм ачівкам без `all_types`. Якщо вимір задачі 5 покаже його найповільнішим — це наступний план (наприклад, тип запитання в рядку `answer`, що вже є міграцією).
4. **Клітинки поля в `unscoredPlayed` і далі не віднімаються.** Це наявна поведінка (функція дивиться лише `round.questions`); план її свідомо зберігає, бо мета — ті самі числа. Якщо це вада, — окреме рішення власника, бо зміна торкнеться точності в старих іграх.
5. **Веб показує останні числа на мить до свіжих.** Між підсторінками свого профілю — без екрана «Завантаження»; свіжа відповідь приходить одразу за ним. Чужий профіль і сторінка ачівок не кешуються.
6. **e2e немає:** видима зміна — лише відсутність «Завантаження» між підсторінками, її покриває тест хука.
