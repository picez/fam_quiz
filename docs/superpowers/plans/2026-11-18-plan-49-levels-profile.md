# План 49: досвід після гри, рідкість досягнень, карта нагород, остання форма

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Рушій не змінюється взагалі. Нове в кімнаті — лише поле `Room.xpMoments` (як `newAchievements` і `leagueResult`: живе в пам'яті, у `SavedRoom` не пишеться, після перезапуску рекордер відновлює його з бази). Якщо виконавцю знадобиться поле стану гри — **зупинитися й спитати контролера** (підвищення обриває живі ігри; власника питають перед пушем).

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`0688abaf`, після плану 48):
> - правила досвіду — `apps/server/src/xp-rules.ts`: `XpReason = 'few_questions' | 'few_accounts' | 'author' | 'repeat_quiz' | 'cap'`, `gameXp(game, ownerId, seen)` → `XpAward { userId, base, counted, reason }` (база = `LEVEL_XP.join` 50 + правильні × `LEVEL_XP.correct` 10 + `LEVEL_XP.place` [100, 60, 30]; `minQuestions` 5, `minAccounts` 3 без автора), `capXp(base, usedToday)` (`dailyCap` 600), `kyivDay`;
> - запис — `apps/server/src/xp-store.ts`: `writeCapped` (~69, рядок `xp_entry` `source 'game'` з `amount`, `reason` = правило або `'cap'`), `creditGame(db, gameId, onError)` (~246; `roles` — `quizId`, `hostId`, `authorOf`), `creditAchievements` (~199; рядки `source 'achievement'`, `ACHIEVEMENT_XP[achievementRarity(id)]` 25/50/100, поза стелею), `xpTotals`, `ownLevel`/`publicLevel`; таблиця `xpEntry` (`db/schema.ts` ~524), `userAchievement.gameId` (~440) — досягнення гри видно без міграції;
> - рівні й нагороди — `packages/shared/src/levels.ts`: `LEVEL_XP`, `ACHIEVEMENT_XP`, `achievementRarity` (це **рівень досвіду** common/rare/epic, не частка гравців — див. «Рішення плану»), `xpForLevel`, `levelOf`, `levelProgress` → `LevelProgress { level, xp, levelAt, nextAt }`, `LevelReward`, `LEVEL_REWARDS` (1–40, на рівні буває кілька), `LEVEL_REWARDS_TOP = 40`, `OwnLevel { progress, unlocked: LevelUnlock[] (з датою at), next (3 рівні), looks }`;
> - рекордер — `apps/server/src/recorder.ts` ~697–738: `save` → `manager.setLeagueResult` (45), `awardGame` + `awardedIn` → `manager.setNewAchievements` (12j), `awardPrizes`, `creditGame` (множина `credited`), `publishGameFeed`; кожен крок — під своєю множиною, збій іде в повтор черги; перевірка «кімната жива» — `!manager.frozen && manager.get(room.code) === room`;
> - кімната — `rooms/manager.ts`: поля `leagueResult`/`newAchievements` (~287, ~299; `null` при створенні ~863 і відновленні ~941), `setLeagueResult` (~1029), `setNewAchievements` (~1091), `view()` (~1554: гілка `player` додає `league`, `newAchievements`); телефонний зріз досягнень — `rooms/achievements.ts` `newAchievementsMine(room, personId)` (гість — `{ account: false }`, `room.playerUsers.get(personId)`);
> - телефон — `apps/web/src/screens/PlayerScreen.tsx` ~1874–1908 (фініш: `place`, ліга, `GameCardView`, `NewAchievements` лише при `ceremony === null`), `screens/NewAchievements.tsx` (гостьовий рядок «Увійди…» з `loginFor`, посилання `<a href>` — повне перезавантаження закриває сокет); `motion.ts` `reducedMotion()` (і легкий режим);
> - досягнення — `achievement-store.ts` `achievementsPage(db, userId, own)` (~494), `achievementList`; маршрути `GET /api/me/achievements`, `GET /api/profiles/:id/achievements` (`profile-routes.ts` ~137–150); веб — `pages/Achievements.tsx` (`CardView` ~151), `profile/AchievementShowcase.tsx` (квадрати й підпис `achievement-caption` з `aria-live`), `api.ts` ~245 (`fetchData<…>`);
> - профіль — `profiles.ts` `profileFacts` (~120: `syncAchievements(…).inputs.games` — ігри гравця вже прочитані, новіші першими, з них беруться `wins`), `ownProfile` (~232) і `publicProfile` (~262) з `Promise.all`; типи `PublicProfile`/`OwnProfile`/`PlayedGame`/`isWin`/`podiumPlace` (`packages/shared/src/profile.ts`, `history.ts` ~227); веб — `pages/Profile.tsx`, `pages/PublicProfile.tsx`, `profile/ProfileHeader.tsx` (`LevelBar`, `HeadlineStats`), `profile/LevelCard.tsx` (`rewardText`, `LevelBar`, `TileFace`, `unlockedByLevel`), `pages/profile/ProfileLooks.tsx` (`/profile/looks`), `profile/ProfileSubpage.tsx` (`SubpageData`), маршрути `AppRoutes.tsx` ~58–74, кеш `profile/my-profile-cache.ts` (лише пам'ять);
> - швидкість профілю (46) — `apps/server/src/profile-speed.test.ts` (знімок `stable({ first, second, third })`, «one profile request reads the player's games once», заборона повних `quiz_snapshot`/`plays`), `forgetPlayedShapes`, скрипт `apps/server/scripts/profile-timing.ts` (`pnpm --filter @quiz/server profile:timing --fixture --runs 5`);
> - i18n — найновіші списки `ADDED_WORDLE`/`ADDED_WORDLE_PLURALS` (`apps/web/src/i18n.test.ts` ~203, перевірка локалей ~422, умова `adds no uk keys beyond the agreed list` ~584), `countText` (`i18n.ts` ~4833; uk — `_one/_few/_many`), `locales/checks.test.ts`, `source-scan.test.ts` (кирилиця в `apps/web/src` — лише в словниках і тестах);
> - e2e-зразки — `apps/server/e2e/part34-levels-cosmetics.e2e.ts` (`account34`: `register`, рядок `xpEntry` учорашнім днем до потрібного рівня; `game34` — вікторина через API), `part45-family-league.e2e.ts` (3+ акаунти, світла тема, 360 px), e2e-сервер у тому ж процесі (`helpers/setup.ts`: `db`, `ctx`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** після гри телефон гравця з акаунтом показує «+N досвіду» з розбивкою, смугу рівня від старого до нового значення, «Новий рівень N!» з відкритими нагородами і причину, коли досвіду 0 чи менше; досягнення показують частку гравців («є в 4 % гравців», «рідкісне», «дуже рідкісне») і скільки досвіду дали; нова сторінка «Нагороди за рівні» з усіма рівнями 1–40; у своєму й публічному профілі — «Остання форма» (10 місць і серія).

**Архітектура:** досвід гри рахує сервер з уже записаних рядків `xp_entry` (нова `gameXpMoments` у `xp-store.ts`; розбивку дає розширений `gameXp` з частинами) одразу після `creditGame` у рекордері й кладе в кімнату (`manager.setXpMoments`, як `setLeagueResult`); телефон бачить лише своє (`PlayerView.xp`). Частка гравців — окремий публічний маршрут `GET /api/achievements/shares` з кешем у пам'яті на годину (профіль і сторінка досягнень його не чекають). Остання форма — чиста функція `recentForm` у `shared` над іграми, які профіль уже прочитав (жодного нового запиту). Карта нагород — лише веб над `LEVEL_REWARDS` і `OwnLevel`.

**Технології:** TypeScript, drizzle (Postgres/PGlite), Fastify + Socket.IO, React 19 + Vite + Testing Library, vitest (проєкти `shared`/`engine`/`server`/`web`), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-levels-profile-batch-design.md` (39, перша черга, частина 1: Р1, Р5, Р6, П1).

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22.** Рушій (`packages/engine`) не змінюється. Якщо щось вимагатиме підвищення — стоп і питання контролеру (у «Розбіжностях» записано, що не вимагає).
- Міграції — лише додавання; цей план **міграцій не має** (усе — з наявних `xp_entry`, `user_achievement.game_id`, `participant`).
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, з правильними множинами (uk `_one/_few/_many`, інші — як вимагає `locales/checks.test.ts`). Нові uk-ключі — у нових списках `ADDED_LEVELS_49`, `ADDED_LEVELS_49_PLURALS` у `apps/web/src/i18n.test.ts`; обидва — в умову `adds no uk keys beyond the agreed list` і в перевірку наявності в усіх локалях (як `ADDED_WORDLE*`); `locales/checks.test.ts` і `source-scan.test.ts` зелені. ru немає. Довідка (`help/*`) — про проведення гри; рівнів там немає, тож довідка не змінюється (правила досвіду вже є в підказці «ⓘ» біля шкали).
- **Нічого, пов'язаного з росією**, — у прикладах, фікстурах, назвах вікторин e2e.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck` (у задачах 1–5 — `pnpm exec tsc -p packages/shared && pnpm exec tsc -p apps/server`, з задачі 6 — `pnpm typecheck`). **Ніколи не запускати prettier.**
- **Команди тестів, збирання, заміру й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів).
- Файли правити лише інструментами редагування (Edit/Write) чи `sed`; **python на цій машині — порожня заглушка, ним нічого не правити й не генерувати**.
- **Профіль не повільнішає:** задача 5 міряє `pnpm --filter @quiz/server profile:timing --fixture --runs 5` до й після; медіани `publicProfile`, `ownProfile`, `achievementsPage` (обидві) після ≤ до (допуск шуму — 10 %), число запитів кожного — те саме. Числа знімка `profile-speed.test.ts` — ті самі (знімок змінюється лише доданим ключем `form`).
- Зменшений рух (`reducedMotion()`, а отже й легкий режим, і `@media (prefers-reduced-motion: reduce)`): смуга досвіду без анімації одразу на кінцевому значенні.
- e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 49"`; кадри — з `E2E_SHOTS=1`; телефон 360 px; світла тема; таймер кожного запитання ≥ 25 с.

## Рішення плану (там, де специфікація мовчить)

**Р1. Досвід за гру**
- Причини — наявні `XpReason`; тип переїжджає в `shared` (`XP_REASONS` у `levels.ts`), `xp-rules.ts` його лише реекспортує. «Гра наодинці» — це `few_accounts` (для однієї людини акаунтів < 3); «вікторина власна» — `author`; ще є `few_questions`, `repeat_quiz`, `cap`.
- Розбивка — з правил, не з бази: `gameXp` додає до `XpAward` частини `parts: { join, correct, correctCount, place }` (нулі, коли правило дало 0); сума частин = `base`. Факт — рядок `xp_entry` гри (`amount`, `reason`): якщо `reason` — правило (не `cap`), рядків гри немає, лишається причина; якщо `cap` — рядки + рядок `cap` зі знаком мінус (`amount − base`).
- Досягнення гри — рядки `xp_entry` `source 'achievement'` тих досягнень, у яких `user_achievement.game_id = гра` (сума з бази, не з таблиці рідкості); порядок — `awardedIn`. Вони поза стелею й даються й при причині (напр. соло: «+25 досвіду» за `first_game`, причина `few_accounts`).
- `gained` = `amount` гри + досягнення гри; `after = levelProgress(загальний досвід зараз)`, `before = levelProgress(загальний − gained)`; `unlocked` = `LEVEL_REWARDS` з `before.level < level ≤ after.level` (сервер, щоб телефон не рахував).
- Коли: у рекордері одразу після `creditGame` (і після ретро — `syncXp`), під новою множиною `momented`; збій — у той самий повтор черги. Після перезапуску сервера множини порожні, `creditGame` нічого не дописує, а `gameXpMoments` читає ті самі рядки — той самий результат.
- Зріз: `PlayerView.xp?` лише у `finished`: гість — `{ account: false }`; акаунт, поки рекордер не дорахував, — `{ account: true, moment: null }` («Рахуємо досвід…»); акаунт без рядка гри (не в таблиці чи збій саме його запису) — ключа немає. Сцена й пульт ключа не мають. Командна гра — кожна людина своє (`room.playerUsers.get(personId)`).
- Гість: картка «Увійдіть, щоб отримувати досвід і досягнення» з посиланням на вхід; гостьовий рядок `NewAchievements` тоді не показується (одне запрошення замість двох).
- Вигляд: картка `.xp-moment` під `GameCardView`, над `NewAchievements`, лише при `ceremony === null`. Рядки «За участь +50», «3 правильні відповіді +30», «За 1-е місце +100», «Денний ліміт −140», «Досягнення «Перша гра» +25»; підсумок «+N досвіду». Смуга — `<progress>` рівня `after`; анімація CSS-змінними від `before` до `after` за 1,2 с; при новому рівні смуга спершу доходить до кінця старого рівня, потім «Новий рівень N!» і заповнення нового; при зменшеному русі — одразу кінцевий стан і текст. Під смугою — «Ще X досвіду до рівня N+1» (на рівні ≥ `LEVEL_REWARDS_TOP` теж, бо досвід рахується далі).

**Р5. Рідкість досягнень**
- Назви: наявне `achievementRarity` — це рівень досвіду; нове — **частка** (`share`), позначка — `AchievementScarcity = 'rare' | 'very_rare'`.
- База — акаунти з хоча б одним рядком `participant` з `rank is not null` у грі `status = 'finished'`; власники досягнень рахуються лише серед бази (інакше «проведи гру» без жодної зіграної дало б > 100 %). Невідомі каталогу id відкидаються.
- `achievementScarcity(holders, players)` → `{ percent, tier }`: `percent` = 0, якщо `holders = 0`, інакше `max(1, round(holders / players × 100))`; `tier` — `'very_rare'` при частці < 3 %, `'rare'` при < 10 %, інакше `null`; при `players < ACHIEVEMENT_SHARE.minPlayers` (10) і при `holders = 0` — `tier: null` (на родинному масштабі «1 з 4» — не рідкість).
- Окремий маршрут `GET /api/achievements/shares` (без входу) → `AchievementShares { players, holders }`; кеш у пам'яті процесу `SHARES_TTL_MS = 3_600_000`, одночасні запити ділять один проміс, збій не кешується. Профіль і сторінка досягнень **не змінюються на сервері** — веб тягне частки окремо й показує, коли прийшли (кеш модуля на годину).
- Показ: на сторінці досягнень — рядок «Є в 4 % гравців» (0 — «Ще ні в кого») і позначка-пігулка «рідкісне»/«дуже рідкісне»; біля здобутого — «+50 досвіду» (`ACHIEVEMENT_XP[achievementRarity(id)]` — те саме число, що пише `creditAchievements`); у вітрині профілю (`AchievementShowcase`, свій і публічний) — у підписі вибраного «Назва · є в 4 % гравців · рідкісне», квадрат рідкісного — клас `is-rare`/`is-very-rare` (обвідка).

**Р6. Карта нагород**
- Маршрут `/profile/levels`, сторінка `pages/profile/ProfileLevels.tsx` (`SubpageData`, `useMyProfile()` з кешем). Посилання «Усі нагороди ›» — у `LevelBar` власного профілю і в `LevelCard` (`/profile/looks`); з телефона після нового рівня — `<a href="/profile/levels">`.
- Зверху — `LevelBar`; далі список `ol.level-map` з 40 рядків: «Рівень N», нагороди рівня (`RewardArt` + `rewardText`), стан: отримані (`level ≤ поточний`) — кольорові, з датою з `OwnLevel.unlocked`; поточний — `.is-current` з «Ви тут» і «Ще X досвіду до рівня N+1»; майбутні — `.is-future`: картинка сірим силуетом (`filter: grayscale(1) brightness(.5)`, `opacity: .55`), підпис «з рівня N» звичайним контрастним текстом. Рівень без нагороди — «Лише досвід». Поточний рядок прокручується у вид (`scrollIntoView({ block: 'center' })`, без плавності при зменшеному русі).
- `RewardArt`: значок — його емодзі; колір/рамка/шрифт/ефект/рамка фото — наявний `TileFace` з `LevelCard.tsx` (експортувати); стікери `💬`, перки `time ⏱️`, `hint 💡`, `ward 🛡️`, `perk_boost ⏩`, форма кубка `🏆`, матеріал `✨`.

**П1. Остання форма**
- `recentForm(games)` у `packages/shared/src/profile.ts` над `PlayedGame[]` (новіші першими, як віддає `playerGames`): рахуються завершені ігри з місцем і > 1 учасником (як `rated` у `podiumStats`); перші `RECENT_FORM_SIZE = 10` → `{ gameId, title, startedAt, place: rank, medal: podiumPlace(game), team }`. Медаль — за `podiumPlace` (те саме, що п'єдестал у статистиці); інакше — число.
- Серія — від найновішої гри по всіх таких іграх: `wins` — поспіль `isWin`, `top3` — поспіль `podiumPlace !== null`. Показ: `wins ≥ 2 && wins × 2 ≥ top3` → «N перемог поспіль»; інакше `top3 ≥ 2` → «N ігор у трійці поспіль»; інакше серії немає.
- Сервер: `profileFacts` додає `form` з уже прочитаних `inputs.games` — нуль нових запитів; `OwnProfile.form` і `PublicProfile.form`. Веб: `profile/RecentForm.tsx` у `ProfileHeader` під `HeadlineStats` (свій і публічний); `ol.recent-form` з кнопками-чипами (🥇🥈🥉 або число), `title` і підпис `aria-live` після дотику: «Назва · 12.11.2026» (командна — «Назва · команда «Сови» · дата»); `aria-label` чипа — «2-е місце, Назва, дата». Нуль ігор — блоку немає. Старий кеш без `form` — блоку немає (не падати).

## Порядок збирання

- Задачі 1–5 — `shared` і `server`; з задачі 6 — веб і `pnpm typecheck`.
- Залежності: 2 ← 1; 3 ← 2; 4 ← 1; 5 ← 1; 6 ← 1; 7 ← 3, 6; 8 ← 4, 5, 6; 9 — остання.

## Фокус рев'ю

1. **Стеля й ретро.** Акаунт з 550 досвіду сьогодні: гра на 190 → «+50», рядок «Денний ліміт −140»; досягнення гри однаково додаються; перший у житті акаунт (без мітки `xp_synced_at`, ретро) бачить ту саму розбивку, без подвоєння рядків. Задачі 2, 3.
2. **Причина замість мовчання.** Соло й «менше 3 акаунтів» → `few_accounts`; автор у таблиці → `author`; повтор вікторини → `repeat_quiz`; 4 запитання → `few_questions`; гість — запрошення увійти. Причина показується і коли досвід > 0 лише від досягнень. Задачі 2, 3, 7, 9.
3. **Перезапуск і повтори.** Повтор черги, перезапуск сервера посеред фінішу, другий виклик рекордера — та сама картка, жодного нового рядка `xp_entry`. Задача 3.
4. **Частка без перекосів.** Ведучий без жодної зіграної гри не рахується ні в базі, ні у власниках; невідомий id відкинуто; порожня база (0 гравців) — 0 %, без ділення на нуль; кеш не вічний (TTL) і не тримає збій. Задача 4.
5. **Профіль не повільнішає й числа ті самі.** Ігри профілю читаються раз (тест 46); знімок відрізняється лише ключем `form`; заміри до/після в коміті. Задача 5.

---

### Задача 1. Спільне: типи досвіду гри, частка досягнень, остання форма

**Files:**
- Modify: `packages/shared/src/levels.ts` — `XP_REASONS`, `XpReason`, `XpLine`, `GameXpMoment`, `PlayerXpView`, `levelUpRewards`; `packages/shared/src/achievements.ts` — `ACHIEVEMENT_SHARE`, `AchievementShares`, `AchievementScarcity`, `achievementScarcity`; `packages/shared/src/profile.ts` — `RECENT_FORM_SIZE`, `FormGame`, `RecentForm`, `recentForm` (поле `form` у профілях додає задача 5); `packages/shared/src/views.ts` — `PlayerView.xp?: PlayerXpView` (doc: «Досвід за гру (49): ставить сервер лише у finished; рушій ключа не ставить»).
- Test: `packages/shared/src/levels.test.ts`, `achievements.test.ts`, `profile.test.ts` (наявні файли).

**Interfaces (Produces):**
```ts
// levels.ts
export const XP_REASONS = ['few_questions', 'few_accounts', 'author', 'repeat_quiz', 'cap'] as const;
export type XpReason = (typeof XP_REASONS)[number];
export type XpLine =
  | { kind: 'join'; xp: number }
  | { kind: 'correct'; xp: number; count: number }
  | { kind: 'place'; xp: number; place: number }
  | { kind: 'cap'; xp: number } // ≤ 0
  | { kind: 'achievement'; xp: number; id: AchievementId };
export interface GameXpMoment {
  gained: number;
  lines: XpLine[];
  reason: XpReason | null;
  before: LevelProgress;
  after: LevelProgress;
  unlocked: { level: number; reward: LevelReward }[];
}
/** Телефон (49): гість — account false; moment null — рекордер ще рахує. */
export type PlayerXpView = { account: false } | { account: true; moment: GameXpMoment | null };
/** Нагороди рівнів from < level ≤ to, у порядку LEVEL_REWARDS. */
export function levelUpRewards(from: number, to: number): { level: number; reward: LevelReward }[];
// achievements.ts
export const ACHIEVEMENT_SHARE = { rare: 10, veryRare: 3, minPlayers: 10 } as const;
export interface AchievementShares { players: number; holders: Partial<Record<AchievementId, number>> }
export type AchievementScarcity = 'rare' | 'very_rare';
export function achievementScarcity(holders: number, players: number): { percent: number; tier: AchievementScarcity | null };
// profile.ts
export const RECENT_FORM_SIZE = 10;
export interface FormGame { gameId: string; title: string; startedAt: string; place: number; medal: 1 | 2 | 3 | null; team: string | null }
export interface RecentForm { games: FormGame[]; streak: { kind: 'wins' | 'top3'; count: number } | null }
export function recentForm(games: readonly PlayedGame[]): RecentForm;
```

- [ ] **Step 1: Write the failing tests:**
  - `levels.test.ts` › `level-up rewards are the table rows between two levels` — `levelUpRewards(1, 2)` містить `{ level: 2, reward: { kind: 'color', id: 'sky' } }` і жодного рядка рівня 1; `levelUpRewards(5, 5)` → `[]`; `levelUpRewards(0, 40)` → `LEVEL_REWARDS`; `XP_REASONS` — рівно 5 причин.
  - `achievements.test.ts` › `the share of players and the rarity marks` — `(0, 0)` → `{ percent: 0, tier: null }`; `(0, 50)` → `{ 0, null }`; `(1, 200)` (0,5 %) → `{ 1, 'very_rare' }`; `(5, 200)` (2,5 %) → `{ 3, 'very_rare' }`; `(6, 200)` (3 %) → `{ 3, 'rare' }`; `(19, 200)` (9,5 %) → `{ 10, 'rare' }`; `(20, 200)` (10 %) → `{ 10, null }`; `(1, 40)` (2,5 %) → `{ 3, 'very_rare' }`; `(1, 9)` (11 %, гравців < 10) → `{ 11, null }`; `(0, 9)` → `{ 0, null }`.
  - `profile.test.ts` › `recent form` — помічник `played(rank, playerCount = 5, patch)` (завершена, `score > 0`): 12 завершених ігор → 10 у порядку входу; гра без місця, незавершена й соло (`playerCount 1`) пропускаються; `medal` 1 для `isWin`, 2 для rank 2 з 3 учасниками, `null` для rank 2 з 2 учасниками (`place: 2`); `team` — назва команди; серії: [1,1,1,2,5] → `{ wins, 3 }`; [1,2,1,3,2,3,5] → `{ top3, 6 }` (перемог 1); [1,1,2,3,3,2,1,5] → `wins 2`, `top3 7` → `{ top3, 7 }` (2 × 2 < 7); [1,1,2,3] → `{ wins, 2 }` (4 ≤ 4); [4,1,1] → `null`; порожньо → `{ games: [], streak: null }`.
- [ ] **Step 2: Run** `pnpm test --project shared --maxWorkers=2 packages/shared/src/levels.test.ts packages/shared/src/achievements.test.ts packages/shared/src/profile.test.ts`. Expected: FAIL (функцій немає).
- [ ] **Step 3: Implement** за «Рішеннями плану» (частку для `tier` порівнювати з точним `holders / players × 100`, не з округленим `percent`).
- [ ] **Step 4: Run** ті самі тести, `pnpm exec tsc -p packages/shared && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared
git commit -m "feat(shared): 49 levels batch — xp reasons and the game xp moment for the phone, level-up rewards, the share of players with rare and very rare marks, the recent form with medals and the most interesting streak"
```

---

### Задача 2. Сервер: розбивка досвіду гри з правил і з записаних рядків

**Files:**
- Modify: `apps/server/src/xp-rules.ts` — `XpReason` реекспорт із `@quiz/shared`; `XpAward.parts`; `apps/server/src/xp-store.ts` — помічник `gameMeta(db, gameId)` (винести запит `roles` з `creditGame`), нова `gameXpMoments`.
- Test: `apps/server/src/xp-rules.test.ts`, `apps/server/src/xp-store.test.ts` (новий `describe('the xp moment of a game (49)')`).

**Interfaces:**
- Consumes: `GameXpMoment`, `XpLine`, `levelUpRewards` (задача 1).
- Produces:
```ts
// xp-rules.ts
export interface XpAward { userId: string; base: number; counted: boolean; reason: Exclude<XpReason, 'cap'> | null; parts: { join: number; correct: number; correctCount: number; place: number } }
// xp-store.ts
/** Після creditGame: userId → картка для кожного акаунта таблиці, що має рядок xp_entry цієї гри; читає лише записане (повтор і перезапуск дають те саме). Незавершена гра — порожньо. */
export async function gameXpMoments(db: Db, gameId: string): Promise<Map<string, GameXpMoment>>;
```

- [ ] **Step 1: Write the failing tests:**
  - `xp-rules.test.ts` › `the award keeps its parts` — 3 акаунти, перше місце, 4 правильні → `parts { join: 50, correct: 40, correctCount: 4, place: 100 }`, `base 190`; третє місце з 0 правильних → `{ 50, 0, 0, 30 }`; `few_accounts`/`author`/`few_questions` → усі частини 0.
  - `xp-store.test.ts` (помічники файлу для гри з 3 акаунтами):
    - `lines from the rules, gained from the rows` — після `creditGame` у переможця з 4 правильними й `first_game`: `lines` = `[join 50, correct 40 (count 4), place 100 (place 1), achievement 25 (first_game)]`, `gained 215`, `reason null`, `before.xp = after.xp − 215`; гравець з 0 правильних і 4-м місцем — лише `join 50` (рядків з 0 немає);
    - `the daily cap shows as a minus line` — 550 досвіду сьогодні (рядок `xpEntry` того ж `kyivDay`), база 190 → `[join, correct, place, cap −140, …досягнення]`, `gained` = 50 + досягнення, `reason 'cap'`;
    - `a zero game keeps only the reason and the achievements` — соло-гра → `lines` лише з досягнень, `reason 'few_accounts'`; автор у таблиці → `'author'`; друга гра з тією ж вікториною → `'repeat_quiz'`;
    - `a level up lists what opened` — досвід перед грою `xpForLevel(2) − 10` (рядок учорашнім днем) → `before.level 1`, `after.level 2`, `unlocked` містить `{ level: 2, reward: { kind: 'color', id: 'sky' } }`;
    - `retro and repeats give the same moment` — акаунт без мітки (`creditGame` іде через `syncXp`): картка та сама, що в живого; другий виклик `gameXpMoments` — `toEqual` першому; число рядків `xp_entry` не змінилось;
    - `a game that never finished` → порожня `Map`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/xp-rules.test.ts apps/server/src/xp-store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `gameXpMoments`: `loadAchievementGames(db, [gameId])` → `gameMeta` → `gameXp(loaded, ownerId, () => false)` лише заради `parts`; одним запитом рядки `xp_entry` гри (`source 'game'`, `gameId`) цих людей; одним — `xp_entry` `source 'achievement'` з `inner join user_achievement` за `(user_id, achievement_id)` і `user_achievement.game_id = gameId`; `xpTotals`. Рядки `correct`/`place` з нулем не додаються; `reason` — правило → рядків гри немає. Порядок досягнень — як у `ACHIEVEMENTS`.
- [ ] **Step 4: Run** ті самі тести. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/xp-rules.ts apps/server/src/xp-rules.test.ts apps/server/src/xp-store.ts apps/server/src/xp-store.test.ts
git commit -m "feat(server): 49 the xp moment of a game — join, correct, place and cap lines from the rules, achievements of this game from the stored rows, before and after levels with what opened; repeats and retro read the same"
```

---

### Задача 3. Сервер: досвід гри в кімнату й на телефон

**Files:**
- Create: `apps/server/src/rooms/xp.ts`, `apps/server/src/recorder.xp-moment.test.ts`
- Modify: `apps/server/src/rooms/manager.ts` — поле `xpMoments: Map<string, GameXpMoment> | null` (null при створенні й відновленні), метод `setXpMoments`, гілка `player` у `view()` додає `xp`; `apps/server/src/recorder.ts` — крок після `creditGame` під множиною `momented` (чиститься там само, де `credited`).

**Interfaces:**
- Consumes: `gameXpMoments` (задача 2), `PlayerXpView` (задача 1).
- Produces:
```ts
// rooms/manager.ts
/** Досвід гри (49) від рекордера; emit changed, лише якщо змінилось (порівняння JSON). */
setXpMoments(room: Room, moments: Map<string, GameXpMoment>): void;
// rooms/xp.ts
/** Лише finished: гість — { account: false }; xpMoments null — { account: true, moment: null }; є картка — вона; інакше undefined. */
export function xpMine(room: Room, personId: string): PlayerXpView | undefined;
```

- [ ] **Step 1: Write the failing tests** (`recorder.xp-moment.test.ts`, за зразком `recorder.levels.test.ts` і `recorder.league.test.ts`):
  - `a finished game tells each phone its own xp` — 3 акаунти + гість, 5 запитань: до запису — у телефона акаунта `view.xp` = `{ account: true, moment: null }`, у гостя `{ account: false }`; після `idle()` — у кожного акаунта своя картка з `gained > 0` і рядком `join`; у сцени й пульта ключа `xp` немає; поза `finished` ключа немає ні в кого;
  - `a solo game says why` — один акаунт: `moment.reason === 'few_accounts'`, `lines` без `join`;
  - `teams: each member sees their own` — 2 команди по 2 акаунти: в учасників однієї команди різні `correct` за власними відповідями, той самий `place`;
  - `retries and a restart give the same card and no new rows` — перший `gameXpMoments` падає (`vi.spyOn`) → повтор черги ставить картку; друге підключення рекордера до відновленої кімнати (як у `recorder.league.test.ts` › `retries and restarts`) — `toEqual` тій самій картці, рядків `xp_entry` стільки ж;
  - `a closed room is left alone` — кімнату закрито до кінця запису → `setXpMoments` не викликано.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/recorder.xp-moment.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» (крок рекордера — одразу після блоку `creditGame`, до `publishGameFeed`; перевірка «кімната жива» — як у `setLeagueResult`).
- [ ] **Step 4: Run** цей тест і `pnpm test --project server --maxWorkers=2 apps/server/src/recorder.levels.test.ts apps/server/src/recorder.league.test.ts apps/server/src/recorder.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/rooms/xp.ts apps/server/src/rooms/manager.ts apps/server/src/recorder.ts apps/server/src/recorder.xp-moment.test.ts
git commit -m "feat(server): 49 the recorder puts the xp moment into the room right after crediting — each phone sees its own card, guests a sign-in hint, retries and restarts read the same rows"
```

---

### Задача 4. Сервер: частка гравців для кожного досягнення з годинним кешем

**Files:**
- Create: `apps/server/src/achievement-shares.ts`, `apps/server/src/achievement-shares.test.ts`
- Modify: `apps/server/src/profile-routes.ts` — `GET /api/achievements/shares`; тест маршруту — у `apps/server/src/profile-routes.test.ts`.

**Interfaces:**
- Consumes: `AchievementShares` (задача 1).
- Produces:
```ts
export const SHARES_TTL_MS = 3_600_000;
/** База — акаунти з місцем у завершеній грі; власники — лише серед бази; кеш у пам'яті на SHARES_TTL_MS, одночасні виклики ділять проміс, збій не кешується. */
export async function achievementShares(db: Db, now?: number): Promise<AchievementShares>;
export function forgetAchievementShares(): void;
```

- [ ] **Step 1: Write the failing tests** (`beforeEach(forgetAchievementShares)`):
  - `counts players with a finished game and holders among them` — 12 акаунтів з місцем у завершеній грі, 3 мають `first_win`, ведучий без жодної гри має `host` → `players 12`, `holders.first_win 3`, `holders.host` немає; учасник незавершеної гри не в базі; рядок `user_achievement` з невідомим id відкинуто;
  - `an empty base` → `{ players: 0, holders: {} }`;
  - `the cache holds for an hour` — другий виклик з `now + SHARES_TTL_MS − 1` після нового `user_achievement` дає старі числа, з `now + SHARES_TTL_MS + 1` — нові;
  - `two calls at once share one read` — `Promise.all` двох викликів → `db.select` викликано стільки ж разів, скільки для одного (шпигун);
  - `a failure is not cached` — перший виклик падає (шпигун), другий — числа;
  - `profile-routes.test.ts` › `the shares route needs no sign-in` — `GET /api/achievements/shares` без cookie → 200 і тіло `AchievementShares`.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/achievement-shares.test.ts apps/server/src/profile-routes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement:** два агреговані запити (база — `count(distinct participant.user_id)` за `participant ⋈ game` з `rank is not null`, `status = 'finished'`, `user_id is not null`; власники — `user_achievement` з `exists` того самого) або один із CTE; фільтр id через `ACHIEVEMENTS`.
- [ ] **Step 4: Run** ті самі тести. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/server/src/achievement-shares.ts apps/server/src/achievement-shares.test.ts apps/server/src/profile-routes.ts apps/server/src/profile-routes.test.ts
git commit -m "feat(server): 49 achievement shares — players with a finished game and holders among them, an hour-long memory cache shared by concurrent reads, a public route outside the profile"
```

---

### Задача 5. Сервер: остання форма в профілі без нових запитів, заміри до й після

**Files:**
- Modify: `packages/shared/src/profile.ts` — `form?: RecentForm` у `PublicProfile` і `OwnProfile` (необов'язкове: старий кеш вебу й фікстури тестів без нього); `apps/server/src/profiles.ts` — `profileFacts` повертає ще `form` (з `inputs.games`), `ownProfile` і `publicProfile` кладуть `form`; `apps/server/src/__snapshots__/profile-speed.test.ts.snap` (оновлює vitest).
- Test: `apps/server/src/profiles.test.ts`, `apps/server/src/profile-speed.test.ts`.

**Interfaces:**
- Consumes: `recentForm`, `RecentForm` (задача 1).
- Produces: `OwnProfile.form`, `PublicProfile.form` у відповідях `GET /api/me/profile` і `GET /api/profiles/:id`.

- [ ] **Step 1: Заміряти «до»** (до будь-яких змін у цій задачі): `pnpm --filter @quiz/server profile:timing --fixture --runs 5`; вивід зберегти у файл scratchpad-у (медіани й число запитів чотирьох профільних читань).
- [ ] **Step 2: Write the failing tests:**
  - `profiles.test.ts` › `the profile shows the recent form` — 3 завершені ігри (1-е, 2-е з 3, 1-е) і соло → у `ownProfile` і `publicProfile` `form.games` — 3 записи новіші першими з медалями `[1, 2, 1]` (соло немає), `streak` `{ kind: 'top3', count: 3 }` (перемога поспіль лише одна); заблокований профіль — як і раніше `null`;
  - `profile-speed.test.ts` › `the recent form is the newest ten of the career` — `first.own.form.games` має 10 записів, `first.own.form` `toEqual` `first.public.form`; наявний тест «reads the player's games once» лишається `{ own: 1, public: 1, achievementsOwn: 1 }`.
- [ ] **Step 3: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profiles.test.ts apps/server/src/profile-speed.test.ts`. Expected: FAIL (нового поля немає; знімок ще старий).
- [ ] **Step 4: Implement:** `form: recentForm(inputs.games.map((g) => g.played))` у `profileFacts`, без нових запитів і без змін порядку `Promise.all`.
- [ ] **Step 5: Run** ті самі тести з `-u` лише для знімка: `pnpm test --project server --maxWorkers=2 apps/server/src/profile-speed.test.ts -u`; потім `git diff apps/server/src/__snapshots__/profile-speed.test.ts.snap` — **у різниці лише додані рядки ключа `"form"`** (жодного `-` поза ними). Інакше — стоп і доповідь контролеру.
- [ ] **Step 6: Заміряти «після»** тим самим `pnpm --filter @quiz/server profile:timing --fixture --runs 5`. Медіани кожного з чотирьох ≤ «до» × 1,1, число запитів — те саме. Інакше — стоп і доповідь (п'ять найповільніших запитів), без самовільних кешів.
- [ ] **Step 7: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/profiles.test.ts apps/server/src/profile-speed.test.ts apps/server/src/profile-routes.test.ts && pnpm exec tsc -p apps/server`. Expected: PASS.
- [ ] **Step 8: Commit** (у тілі коміту — дві таблиці медіан «до/після» з кроків 1 і 6)
```bash
git add apps/server/src/profiles.ts apps/server/src/profiles.test.ts apps/server/src/profile-speed.test.ts apps/server/src/__snapshots__/profile-speed.test.ts.snap
git commit -m "feat(server): 49 the recent form in the own and public profile — the newest ten placed games and a streak from the games the profile already read, no new queries, the same numbers, timing before and after in the body"
```

---

### Задача 6. Веб: тексти в 7 мовах

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` (`ADDED_LEVELS_49`, `ADDED_LEVELS_49_PLURALS` — в умову «adds no uk keys…» і в перевірку локалей).

**Ключі (uk):**
- `ADDED_LEVELS_49`: `xpMomentTitle` «Досвід за гру»; `xpMomentGained` «+{xp} досвіду»; `xpMomentPending` «Рахуємо досвід…»; `xpMomentGuest` «Увійдіть, щоб отримувати досвід і досягнення.»; `xpMomentGuestLink` «Увійти»; `xpLineJoin` «За участь»; `xpLinePlace` «За {place}-е місце»; `xpLineCap` «Денний ліміт»; `xpLineAchievement` «Досягнення «{name}»»; `xpMomentLevelUp` «Новий рівень {n}!»; `xpMomentUnlocked` «Відкрито: {list}»; `xpMomentToNext` «Ще {xp} досвіду до рівня {n}»; `xpMomentAllRewards` «Усі нагороди»; `xpReason_few_questions` «Зіграно менше {n} запитань — за таку гру досвіду немає.»; `xpReason_few_accounts` «У грі менше {n} гравців з акаунтом (або гра наодинці) — досвіду немає.»; `xpReason_author` «Це ваша вікторина — за власні досвіду немає.»; `xpReason_repeat_quiz` «За цю вікторину ви вже отримували досвід.»; `xpReason_cap` «Денний ліміт {cap} досвіду вичерпано — решту не враховано.»; `achievementShare` «Є в {percent} % гравців»; `achievementShareNone` «Ще ні в кого»; `achievementRare` «рідкісне»; `achievementVeryRare` «дуже рідкісне»; `achievementXp` «+{xp} досвіду»; `levelMapTitle` «Нагороди за рівні»; `levelMapLink` «Усі нагороди»; `levelMapFrom` «з рівня {n}»; `levelMapHere` «Ви тут»; `levelMapNoReward` «Лише досвід»; `levelMapGot` «Отримано {date}»; `formTitle` «Остання форма»; `formGame` «{title} · {date}»; `formTeamGame` «{title} · команда «{team}» · {date}»; `formPlaceAria` «{place}-е місце, {game}»; `xpLineCorrect_one` «{count} правильна відповідь»; `formWins_one` «{count} перемога поспіль»; `formTop3_one` «{count} гра в трійці поспіль».
- `ADDED_LEVELS_49_PLURALS`: `xpLineCorrect_few` «{count} правильні відповіді», `xpLineCorrect_many` «{count} правильних відповідей», `formWins_few` «{count} перемоги поспіль», `formWins_many` «{count} перемог поспіль», `formTop3_few` «{count} гри в трійці поспіль», `formTop3_many` «{count} ігор у трійці поспіль».
- Інші мови — ті самі ключі з формами множини своєї мови (en/de/es/it — `_one/_other`, pl — `_one/_few/_many`, ar — як наявні множинні ключі `ar.json`); «досвід» = XP-термін, яким уже перекладено `levelXp` у кожній локалі.

- [ ] **Step 1: Write the failing test** — списки й умови в `i18n.test.ts`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts`. Expected: FAIL (ключів немає).
- [ ] **Step 3: Implement** ключі в `i18n.ts` і 6 локалях (типи `CountKey` для трьох множинних основ).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/locales/checks.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/i18n.ts apps/web/src/i18n.test.ts apps/web/src/locales
git commit -m "feat(web): 49 texts in seven languages — xp moment lines and reasons, achievement shares and rarity, the level rewards map, the recent form with plurals"
```

---

### Задача 7. Веб: картка «Досвід за гру» на телефоні

**Files:**
- Create: `apps/web/src/screens/XpMoment.tsx`, `apps/web/src/screens/XpMoment.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx` (фініш: `<XpMoment xp={view.xp} />` під `GameCardView`, при `ceremony === null`; гостьовий рядок `NewAchievements` не показувати, коли `view.xp?.account === false`), `apps/web/src/styles.css` (`.xp-moment*`, світла тема в `:root.is-light`), `apps/web/src/screens/PlayerScreen.test.tsx` (наявний тест гостьового рядка — під нову умову).

**Interfaces:**
- Consumes: `PlayerXpView`, `GameXpMoment`, `XpLine` (задача 1), ключі задачі 6, `rewardText` (`profile/LevelCard.tsx`), `reducedMotion()`.
- Produces: `export function XpMoment({ xp }: { xp: PlayerXpView | undefined }): JSX.Element | null`; `export function xpLineText(line: XpLine): string`.

- [ ] **Step 1: Write the failing tests** (`XpMoment.test.tsx`):
  - `undefined` → нічого; `{ account: false }` → «Увійдіть, щоб отримувати досвід і досягнення.» і посилання «Увійти» на `loginFor('/profile')`; `{ account: true, moment: null }` → «Рахуємо досвід…» (`role="status"`);
  - `shows the lines and the sum` — картка з `[join 50, correct 30 (3), place 100 (1), cap −40, achievement 25 first_game]` → рядки «За участь +50», «3 правильні відповіді +30», «За 1-е місце +100», «Денний ліміт −40», «Досягнення «Перша гра» +25», підсумок «+165 досвіду», причина `cap` — «Денний ліміт 600 досвіду вичерпано…»;
  - `a zero game explains` — `gained 0`, `reason 'few_accounts'` → «+0 досвіду» і «У грі менше 3 гравців з акаунтом…»;
  - `a level up` — `before.level 4`, `after.level 5`, `unlocked [{ 5, perk time }]` → «Новий рівень 5!», «Відкрито: …» (`rewardText`), посилання «Усі нагороди» на `/profile/levels` (`<a href>`), «Ще N досвіду до рівня 6»;
  - `reduced motion shows the end at once` — `matchMedia('(prefers-reduced-motion: reduce)')` → `progress.value === after.xp − after.levelAt` одразу й клас `is-still`; без нього — клас `is-animated` і CSS-змінні `--xp-from`/`--xp-to`;
  - `PlayerScreen.test.tsx` › `finished: the xp card sits above new achievements, the guest sees one sign-in hint`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/XpMoment.test.tsx apps/web/src/screens/PlayerScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» → «Вигляд» Р1 (анімація — CSS `@keyframes` над `--xp-from`→`--xp-to`, `@media (prefers-reduced-motion: reduce)` теж вимикає; текст на картці — контраст ≥ 4,5 : 1 в обох темах).
- [ ] **Step 4: Run** ті самі тести й `apps/web/src/styles-light.test.ts`, `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/screens/XpMoment.tsx apps/web/src/screens/XpMoment.test.tsx apps/web/src/screens/PlayerScreen.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/styles.css
git commit -m "feat(web): 49 the xp card at the end of the game — lines and the sum, a level bar filling from before to after, «Новий рівень» with what opened, the reason for zero, one sign-in hint for guests, still under reduced motion"
```

---

### Задача 8. Веб: рідкість досягнень, карта нагород, остання форма

**Files:**
- Create: `apps/web/src/achievement-shares.ts` (+ `.test.ts`), `apps/web/src/pages/profile/ProfileLevels.tsx` (+ `.test.tsx`), `apps/web/src/profile/RecentForm.tsx` (+ `.test.tsx`)
- Modify: `apps/web/src/api.ts` (`getAchievementShares = () => fetchData<AchievementShares>('/api/achievements/shares')`), `apps/web/src/pages/Achievements.tsx` (`CardView`), `apps/web/src/profile/AchievementShowcase.tsx`, `apps/web/src/profile/LevelCard.tsx` (експорт `TileFace`, посилання «Усі нагороди ›» у `LevelBar` за пропом `mapTo?: string` і в `LevelCard`), `apps/web/src/profile/ProfileHeader.tsx` (проп `form?: RecentForm` → `RecentForm` під `HeadlineStats`), `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/PublicProfile.tsx`, `apps/web/src/AppRoutes.tsx` (`/profile/levels`, статичний сегмент до `/profile/:id`), `apps/web/src/styles.css`; тести — `pages/Achievements.test.tsx`, `profile/AchievementShowcase.test.tsx`, `pages/Profile.test.tsx`, `pages/PublicProfile.test.tsx`, `AppRoutes.test.tsx`.

**Interfaces:**
- Consumes: `achievementScarcity`, `AchievementShares`, `ACHIEVEMENT_XP`, `achievementRarity`, `LEVEL_REWARDS`, `LEVEL_REWARDS_TOP`, `RecentForm` (задача 1), маршрут задачі 4, `form` задачі 5, ключі задачі 6.
- Produces:
```ts
// achievement-shares.ts — кеш модуля на годину; null, поки не прийшло чи збій (тоді блок просто не показується)
export function useAchievementShares(): AchievementShares | null;
export function forgetAchievementShares(): void; // тести
export function ProfileLevels(): JSX.Element;               // pages/profile/ProfileLevels.tsx
export function RecentForm({ form }: { form: RecentForm | undefined }): JSX.Element | null; // profile/RecentForm.tsx
```

- [ ] **Step 1: Write the failing tests:**
  - `achievement-shares.test.ts` — два хуки одночасно → один `fetch`; повторний монтаж у межах години — без `fetch`; збій → `null` і наступний монтаж питає знову.
  - `Achievements.test.tsx` › `shows the share, the rarity mark and the xp` — частки `{ players: 200, holders: { first_win: 5, games_100: 30 } }`: картка «Перша перемога» — «Є в 3 % гравців» і «дуже рідкісне»; «100 ігор» — «Є в 15 % гравців» без позначки; без власників — «Ще ні в кого»; здобута common — «+25 досвіду», epic — «+100 досвіду», нездобута — без «+…»; частки ще не прийшли — сторінка та сама без цих рядків.
  - `AchievementShowcase.test.tsx` › `the caption tells the share` — вибір квадрата `first_win` → підпис «Перша перемога · є в 3 % гравців · дуже рідкісне»; квадрат має клас `is-very-rare`.
  - `ProfileLevels.test.tsx` — профіль рівня 12 з `xp` посередині: 40 рядків `li` у `ol.level-map`; рядки 1–12 без `is-future`, рядок 12 — `is-current` з «Ви тут» і «Ще N досвіду до рівня 13»; рядок 13 — `is-future` з «з рівня 13»; рядок без нагороди (якщо такий є в `LEVEL_REWARDS` — знайти в тесті, інакше пропустити перевірку) — «Лише досвід»; отримані з датою — «Отримано 04.11.2026».
  - `RecentForm.test.tsx` — `[1, 3, 5]` → чипи 🥇, 🥉, «5»; дотик до третього → підпис «Назва · дата» у `aria-live`; командна гра — «команда «Сови»»; `streak { wins, 3 }` → «3 перемоги поспіль»; `{ top3, 5 }` → «5 ігор у трійці поспіль»; `undefined` і `{ games: [] }` → нічого.
  - `Profile.test.tsx` / `PublicProfile.test.tsx` — «Остання форма» в шапці обох; у власному — посилання «Усі нагороди» на `/profile/levels` біля шкали. `AppRoutes.test.tsx` — `/profile/levels` рендерить «Нагороди за рівні».
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/achievement-shares.test.ts apps/web/src/pages/Achievements.test.tsx apps/web/src/profile/AchievementShowcase.test.tsx apps/web/src/pages/profile/ProfileLevels.test.tsx apps/web/src/profile/RecentForm.test.tsx apps/web/src/pages/Profile.test.tsx apps/web/src/pages/PublicProfile.test.tsx apps/web/src/AppRoutes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Рішеннями плану» Р5, Р6, П1 (силует майбутніх — фільтр лише на `.reward-art`, текст підпису не фільтрується; світла тема — свої значення в `:root.is-light`; на 360 px рядок форми з 10 чипів вміщується без бокового скролу, чип ≥ 32 px).
- [ ] **Step 4: Run** ті самі тести, `apps/web/src/styles-light.test.ts`, `apps/web/src/source-scan.test.ts`, `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src
git commit -m "feat(web): 49 achievement shares with rare and very rare marks and xp per achievement, the level rewards map with grey silhouettes and the current level, the recent form with medals and a streak on the own and public profile"
```

---

### Задача 9. Наскрізні сценарії й кадри (`part49-levels-profile.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part49-levels-profile.e2e.ts` (структура `it(… try/catch snapshot …, 600_000)`, `useE2eServer()`, помічники `register`, `myId`, `join`, `expectNoSideScroll`, `shot`; акаунт із досвідом — як `account34`; вікторина через API — як `game34`, тут 5 запитань `single`/`boolean` з таймером 25–30 с; помічники з суфіксом `49`; перед сценарієм рідкості — `forgetAchievementShares()` з `../src/achievement-shares`).

**Сценарії:**
1. `it('part 49: end of game — the xp card with lines, a new level and what opened, a guest hint, phone 360 px, light theme')` — 3 акаунти (Оля з досвідом `xpForLevel(2) − 20` учора, Тарас, Петро) і гість; 5 запитань; Оля відповідає правильно на всі → фініш: «Досвід за гру», «За участь +50», «5 правильних відповідей +50», «За 1-е місце +100», рядок кожного досягнення гри з його досвідом (щонайменше «Перша гра» +25), «Новий рівень N!», де N — `levelOf` суми `xp_entry` Олі з бази (≥ 2: досягнення можуть підняти й вище), «Відкрито: …», посилання «Усі нагороди»; у гостя — одне «Увійдіть, щоб отримувати досвід і досягнення.»; сцена й пульт без картки; кадри `xp49-phone-360`, `xp49-guest-360`; **світла тема** (`quiz:theme = light`, `is-light` на `<html>`) — кадр `xp49-light-phone-360`, контраст тексту картки ≥ 4,5; `expectNoSideScroll`; з `reducedMotion` (`page.emulateMedia({ reducedMotion: 'reduce' })`) смуга одразу на кінцевому значенні.
2. `it('part 49: a solo game says why there is no xp')` — Оля сама (автопілот чи гра з одним телефоном), 5 запитань → «+0 досвіду» (або лише досягнення) і «У грі менше 3 гравців з акаунтом (або гра наодинці) — досвіду немає.»; кадр `xp49-solo-reason`.
3. `it('part 49: achievements show the share of players and the xp, the showcase caption tells it')` — після сценарію 1 (`forgetAchievementShares()`): `/profile/achievements` Олі — «Є в N % гравців», «+25 досвіду» біля здобутого; засіяти 10+ акаунтів з місцем у завершеній грі через `db` і одне досягнення лише в одного → «дуже рідкісне»; публічна сторінка досягнень і вітрина профілю — підпис з часткою; кадри `rarity49-own-360`, `rarity49-light-360`.
4. `it('part 49: the level rewards map — 40 levels, the current one highlighted, grey silhouettes ahead')` — з профілю «Усі нагороди» → `/profile/levels`: 40 рядків, поточний у виді з «Ви тут», майбутні з «з рівня N»; на 360 px без бокового скролу; кадри `levels49-map-360`, `levels49-map-light-360`.
5. `it('part 49: the recent form on the own and public profile')` — після сценаріїв 1–2: у профілі Олі «Остання форма» з 🥇 і числом, дотик — назва й дата; у публічному профілі Олі (з акаунта Тараса) — те саме; серія «2 перемоги поспіль» після другої виграної гри; кадри `form49-own-360`, `form49-public-light-360`.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 49"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** на 360 px картка досвіду, карта нагород і рядок форми без горизонтального скролу; силуети майбутніх нагород сірі, а підписи читаються; світла тема читається.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e
git commit -m "test(e2e): part 49 — the xp card with lines and a new level, a guest hint and a solo reason, achievement shares and rarity, the 40-level rewards map, the recent form on own and public profiles, 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **`GAME_STATE_VERSION` не підвищується (22).** Рушій не змінюється; картка досвіду — поле кімнати `xpMoments` у пам'яті (як `newAchievements`, `leagueResult`), після перезапуску рекордер читає її з бази знову. Підвищення не потрібне ні для чого в цьому плані.
2. **Міграцій немає.** Розбивка рахується з правил (`gameXp` з частинами) і з наявних рядків `xp_entry`; досягнення гри — через наявний `user_achievement.game_id`. Наслідок: якщо правила досвіду колись зміняться, картка давньої гри після перезапуску покаже розбивку за новими правилами (сума — однаково з бази). Для картки на фініші це неважливо.
3. **«Рідкість» — нове слово для частки.** У коді вже є `achievementRarity` (common/rare/epic — скільки досвіду дає досягнення). Частку гравців названо `share`, позначку — `AchievementScarcity` (`rare`/`very_rare`), щоб не зламати наявне. Пороги — зі специфікації (< 10 %, < 3 %); **додано мінімум 10 гравців у базі**: на родинному масштабі «1 з 4» — не рідкість.
4. **Частки — окремим маршрутом, не в профілі.** Специфікація каже «в картці досягнення (своєму й публічному профілі)» і «профіль не має сповільнитися». Відповіді профілю й сторінки досягнень на сервері не змінюються; веб тягне `GET /api/achievements/shares` (кеш сервера година, кеш вебу година) і дописує рядки, коли прийшли. Так профіль гарантовано не повільнішає, а частка однакова для всіх сторінок.
5. **«Скільки досвіду дало досягнення»** — `ACHIEVEMENT_XP[achievementRarity(id)]` на вебі: це те саме число, яке пише `creditAchievements` для кожного досягнення (рядки досягнень поза стелею). На телефоні після гри — суми з бази.
6. **«Гра наодинці»** окремої причини не має: у правилах це `few_accounts` (< 3 акаунтів, автор не рахується); текст причини каже про обидва випадки. Окремий виклик (44) — так само `few_accounts`.
7. **Гість.** Замість двох запрошень (досягнення й досвід) — одне «Увійдіть, щоб отримувати досвід і досягнення»; гостьовий рядок `NewAchievements` при цьому ховається.
8. **Остання форма:** рахуються завершені ігри з місцем і більш ніж одним учасником (гра наодинці «першим місцем» не є); медаль — за `podiumPlace` (те саме правило, що «П'єдестал» у статистиці: напр. 2-е з двох — число «2», не срібло). «Найцікавіша серія»: перемоги, якщо їх ≥ 2 і вдвічі менше за трійку не бувають, інакше трійка. Дата — початок гри (`startedAt`, як в історії).
9. **Карта нагород** — окрема сторінка `/profile/levels`; посилання — біля шкали рівня у власному профілі, у «Вигляді» (`/profile/looks`) і з картки нового рівня на телефоні. Публічного варіанту немає (специфікація — «з профілю, біля смуги рівня»). Картинки нагород: вигляди ніка — справжні зразки, решта — емодзі за видом.
10. **Довідка не змінюється:** довідка — про проведення гри; правила досвіду вже пояснює підказка «ⓘ» біля шкали.
