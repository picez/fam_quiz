# План 6k: запрошення друзів, порівняння з другом і нові ачівки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** розширити друзів і ачівки з плану 6f.
1. Ведучий запрошує друзів просто з лобі. Запрошений бачить позначку в меню й блок «Вас запросили» у профілі з кнопкою «Приєднатися».
2. На публічному профілі іншого гравця той, хто увійшов, бачить блок «Ви і <нікнейм>» зі спільними іграми.
3. Вісім нових ачівок, які рахуються з уже збереженої історії.

**Архітектура:**
- **Запрошення (`server`, у пам'яті).** Новий модуль `apps/server/src/invites.ts`, клас `Invites`. Він тримає запрошення поруч із кімнатами `RoomManager` і підписаний на `manager.onEvent`. Кімната закрилася або її етап уже не `lobby`: усі її запрошення зникають. Окремої таблиці й міграції немає. Запрошення живе не довше за лобі, а лобі й так живе лише в пам'яті процесу: після перезапуску сервера немає ні кімнат, ні запрошень.
- **Маршрути запрошень (`server`).**
  - `POST /api/games/by-code/:code/invites` і `GET` за тією ж адресою доступні лише ведучому кімнати.
  - `GET /api/me/invites` і `DELETE /api/me/invites/:code` доступні лише запрошеному.
  - `GET /api/me/friends` віддає легкий список друзів для лобі, без повного профілю.
- **Як запрошений дізнається (`web`).** Клієнт сам опитує `GET /api/me/invites`, сокетів немає. Хук `useInvites` запитує сервер, коли змінюється адреса сторінки (як `useAccount(location.key)` у меню), раз на 30 секунд, поки вкладка видима, і за подією `quiz:invites-changed` після відхилення. Сокети зараз автентифікуються токенами кімнати, а не сесією. Окремий «особистий» сокет означав би нову автентифікацію сокетів і стан з'єднань заради однієї позначки. Затримка до 30 секунд для лобі прийнятна: лобі живе до 2 годин.
- **Порівняння (`server`).** `versusOf(db, viewerId, otherId)` у новому `apps/server/src/versus.ts` бере `playerGames` обох користувачів і перетинає їх за `gameId`. Маршрут `GET /api/me/versus/:id` віддає дані лише тому, хто увійшов, і лише про нього самого та цього користувача. `PublicProfile` не змінюється: його ключі закріплені тестом приватності з 6f.
- **Ачівки (`server` + `shared`).** `ACHIEVEMENTS` дописується вісьмома id у кінець. Для подвигів у межах раунду (бліц, фінал, камбек) і для гри з друзями потрібні рядки всіх учасників гри. Нова функція `gameTables(db, gameIds)` у `history.ts` віддає по кожній грі типи раундів зі знімка й учасників з їхніми рядками відповідей. Чисті функції в `achievements.ts` рахують із цього факти, а `profileFacts` передає їх у `achievementsOf`.
- **Інтерфейс (`web`).**
  - `InviteFriends` стоїть у лобі на пульті (`HostScreen`).
  - `InviteList` стоїть угорі сторінки «Профіль».
  - Позначка з числом стоїть на пункті меню «Профіль».
  - `VersusBlock` стоїть на `PublicProfile`.

**Технології:** TypeScript, zod 4, vitest, Fastify (+ @fastify/rate-limit), Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація** (окремого документа немає; обов'язкові вимоги власника від 2026-10-23):
> Розширити друзів і ачівки (план 6f випустив профілі, односторонню підписку «друзі», 8 ачівок). Рішення власника (2026-10-23):
> 1. **Запрошення на сайті.** У лобі ведучий натискає «Запросити друзів» і вибирає зі списку своїх друзів. Запрошений бачить позначку в меню (пункт «Профіль» або окремий індикатор), а в профілі блок «Вас запросили: <назва вікторини>, код 123456, [Приєднатися]». Вирішити: скільки живе запрошення (лише поки кімната в лобі / не почалась; зникає, коли гра почалась або кімната закрилась), як запрошений дізнається наживо (сокет для тих, хто увійшов, чи опитування `/api/me/invites` під час навігації — найпростіший надійний варіант, назвати його), відхилення запрошень, обмеження частоти / спам (лише власні друзі ведучого; підписка одностороння — вирішити, чи має запрошений підписатися у відповідь; назвати наслідки для приватності), без email/push.
> 2. **Порівняння з другом.** На публічному профілі друга (будь-якого користувача?) блок «Ви і <нікнейм>»: скільки ігор зіграли разом, хто частіше був вище, середній % правильних кожного в цих спільних іграх, останні спільні ігри (дата, вікторина, місця). Вирішити видимість: показувати лише тому, хто увійшов, про нього самого і цього користувача (ніколи не розкривати третіх осіб), і чи потрібна підписка. Рахувати з таблиць історії (participant.user_id пов'язує гравців з акаунтами; див. `apps/server/src/history.ts`, `profiles.ts`, `achievements.ts`, спільні `gameStats`/`isWin`).
> 3. **Більше ачівок.** Запропонувати й реалізувати розумний розширений набір (наприклад, етапи проведення ігор, серія 10, ідеальний фінал, перемога камбеком, гра з 5 різними друзями, перемога в бліц-раунді…) — лише ті, що рахуються зі збереженої історії; список розумний (~6–10 нових), заблоковані показуються як зараз.
>
> Правила приватності з 6f мають триматися: email ніколи не публічний; друзі й вікторини лише для власника.

**Рішення плану там, де вимоги мовчать:**
- **Скільки живе запрошення.** Лише поки кімната в `lobby`. Запрошення зникає, коли:
  - ведучий почав гру (етап став іншим);
  - кімната закрилась (`LOBBY_TTL_MS`, 2 години);
  - запрошений відхилив його;
  - запрошений уже приєднався до цієї кімнати з акаунта (`room.playerUsers` містить його id; запрошення просто не віддається);
  - ведучий прибрав його з друзів (перевірка `isFollowing` під час читання).
- **Взаємна підписка не потрібна.** Ведучий може запросити будь-кого зі свого списку друзів. Типовий шлях такий: ведучий додає гравців після гри, а вимога, щоб і вони додали його, ламала б цей шлях. Захист від спаму:
  - запрошувати можна лише своїх друзів, інші id тихо відкидаються;
  - гру створює лише ведучий з акаунта (`CREATE_LIMIT` 20/хв);
  - не більше `MAX_INVITES_PER_ROOM = 30` запрошених на кімнату;
  - `POST` запрошень обмежено 30 запитами на хвилину на користувача;
  - запрошення зникає разом із лобі, а запрошений може його відхилити.
  Повторне запрошення того самого друга в ту саму кімнату нічого не змінює (не дублюється і не «оживає» після відхилення, див. нижче).
- **Відхилене запрошення не повертається.** `dismiss` позначає пару (кімната, користувач) як відхилену. Повторне `invite` у ту саму кімнату цього користувача не запрошує знову. Так ведучий не може «смикати» людину повторними натисканнями.
- **Приватність запрошень.**
  - Запрошення розкриває запрошеному, що ведучий має його в друзях (список друзів інакше приватний). Це неминуче для функції «запросити друга», і ми це приймаємо.
  - Запрошений бачить нікнейм і аватар ведучого (`ProfileCard`), назву вікторини й код. Email ведучого не віддається.
  - Ведучий бачить лише id тих, кого сам запросив, і не дізнається, чи запрошення відхилили: `GET` для ведучого повертає список запрошених, разом із відхиленими.
  - Чужий ведучому користувач на `POST` і `GET` запрошень отримує `404 game_not_found`, як у `host-access`.
- **Порівняння видно лише тому, хто увійшов**, і лише про пару «я і цей користувач». Підписка не потрібна: обоє бачили одне одного на подіумі спільної гри, тож нового про другого порівняння не розкриває.
  - Не потрапляють у відповідь: нікнейми й акаунти третіх гравців, бали, відповіді, id учасників.
  - Потрапляють: `gameId`, назва, дата, місце кожного з двох і агрегати.
  - Аноніму маршрут відповідає 401, власний id дає 400 `self_versus`, невідомий id дає 404.
- **Що таке спільна гра.** Завершена (`status === 'finished'`) гра, де обоє брали участь з акаунта. Перервані ігри місць не мають, тому не рахуються зовсім, навіть у «разом». Якщо в одній грі людина мала двох учасників (увійшла з двох пристроїв), береться учасник із кращим місцем (`bestPerGame`).
- **«Хто частіше вище».** Рахуються ігри, де в обох є місце й місця різні. Однакове місце не йде нікому. Відсоток правильних рахує `gameStats(...).accuracy` по спільних іграх кожного окремо. «Останні спільні ігри»: не більше `VERSUS_RECENT = 5`, найновіші першими, без посилань (сторінка гри `/history/:id` доступна лише ведучому).
- **Нові ачівки** (вісім, у такому порядку після наявних):

  | id | Назва | Умова |
  |---|---|---|
  | `games_100` | 100 ігор | `games >= 100` |
  | `host_10` | Досвідчений ведучий | `hosted >= 10` (завершені проведені) |
  | `streak_10` | Серія 10 правильних поспіль | `bestStreak >= 10` |
  | `win_streak_3` | Три перемоги поспіль | три `isWin` поспіль серед завершених ігор за часом початку; перервані пропускаються, а не рвуть серію |
  | `blitz_win` | Король бліцу | у бліц-раунді (`type === 'blitz'`) сума балів гравця > 0 і строго більша за суму кожного іншого учасника; у грі ≥ 2 учасників |
  | `final_hit` | Влучна ставка | у фінал-раунді є рядок `accepted && points > 0` |
  | `comeback` | Камбек | `isWin` у грі, де зіграно ≥ 2 раунди, а перед останнім зіграним раундом хтось мав строго більше балів (сума `answer.points` у раундах з меншим індексом) |
  | `friends_5` | Компанія друзів | серед учасників ваших ігор (з акаунтами, не ви) щонайменше 5 різних людей з вашого списку друзів |

  - Бали раунду рахуються як сума `answer.points` рядків цього раунду, разом зі штрафними. Рекордер пише в `points` повні бали з бонусом серії та штраф бліц-клітинки, тож сума збігається з рахунком.
  - Перервана гра камбеку не дає, бо `isWin` вимагає `finished`.
  - Публічна ачівка `friends_5` розкриває лише те, що людина грала щонайменше з п'ятьма своїми друзями, але не хто вони. Ми це приймаємо.
- **Позначка в меню** — це число на пункті «Профіль» (`menu-badge`) з доступною назвою «Запрошень: N». Окремого пункту меню немає: на телефоні нижня панель уже має чотири пункти.
- **Де стоїть «Запросити друзів».** На пульті, лише на етапі `lobby`, під списком гравців і над посиланнями. Кнопка розгортає список друзів: кожен рядок має кнопку «Запросити», яка після успіху стає неактивною «Запрошено». Без друзів панель показує «Друзів поки немає. Додайте їх у профілі.» і посилання на `/profile`, яке відкривається в новій вкладці, щоб не покинути пульт.
- **Без міграцій.** План не змінює схему бази. Це ще й прибирає зіткнення номерів міграцій з паралельним планом 6j.

## Глобальні обмеження

- Гра, бали, етапи, історія ведучого й наявні маршрути профілю поводяться точно як зараз. Наявні тести лишаються зеленими без змін очікувань, окрім механічних:
  - `toHaveLength(8)` для ачівок у `profile-routes.test.ts` і `profiles.test.ts` стає `toHaveLength(16)`;
  - тест `achievementsOf lists all eight…` перелічує шістнадцять;
  - у `vi.mock('../api', …)` у `Menu.test.tsx`, `PublicProfile.test.tsx` і `Profile.test.tsx` додаються нові функції з безпечними значеннями за замовчуванням.
- Приватність із 6f тримається:
  - `GET /api/profiles/:id` має ті самі ключі (`['achievements', 'avatar', 'following', 'id', 'nickname', 'stats']`);
  - email, вікторини, друзі й перемоги віддаються лише власнику;
  - нові маршрути віддають `ProfileCard` (лише `id`, `nickname`, `avatar`) і ніколи email.
  Приватність перевіряється тестами на рівні API (`app.inject`).
- Значення:
  - `MAX_INVITES_PER_ROOM = 30`;
  - `POST` запрошень: 30 на хвилину на користувача;
  - `GET /api/me/invites`: 60 на хвилину на користувача;
  - `GET /api/me/versus/:id`: 60 на хвилину на користувача;
  - опитування запрошень `INVITES_POLL_MS = 30_000`;
  - `VERSUS_RECENT = 5`;
  - у тілі `POST` від 1 до 30 id, кожен до 64 символів.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`. Кольори лише через наявні токени `styles.css` (`--amber`, `--paper`, `--dim`, `--line`, `--panel`, `--stage`). Тема лише темна. Нові класи мають префікси `invite-`, `menu-badge`, `versus-` і не перевизначають наявних.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням.
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри для перевірки дизайну знімаються з `E2E_SHOTS=1`, серед них телефон 375 px через `expectPhoneFit`.
- Без email і push. Без нових залежностей.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника).

## Порядок збирання

- Задачі 1, 2 і 3 (сервер: ачівки, порівняння, запрошення) незалежні одна від одної.
  - Задача 1 змінює `ACHIEVEMENTS` і тому тим самим комітом оновлює `ICONS` у `AchievementList.tsx` та ключі `achievement_*` в `i18n.ts`: інакше `pnpm typecheck` червоний (`Record<AchievementId, string>`).
- Задача 4 (вебзапрошення) спирається на задачу 3, задача 5 (вебпорівняння) на задачу 2.
- Задача 6 (наскрізний сценарій) іде останньою.
- Паралельно пишеться план 6j (новий тип запитання). Він теж може чіпати `i18n.ts`, `HostScreen.tsx` і `styles.css`. Конфлікти злиття там очікувані й механічні: обидва лише дописують.

## На що дивитися рецензентові

1. **Запрошення після старту чи закриття кімнати.** Гру почали або лобі сплило: запрошення зникає з `GET /api/me/invites` одразу, без перезапуску. Новий `POST` у вже розпочату гру дає `409 wrong_phase`. Код, який після закриття видали новій кімнаті, не показує старого запрошення. Тести: задача 3, `invites vanish when the game starts or the room closes` і `a reused code does not resurrect an old invite`.
2. **Чужі id і чужа кімната.** Ведучий запрошує id, якого немає в його друзях: той не запрошений і нічого не бачить. Інший користувач не може запрошувати в чужу кімнату чи читати її запрошення. Відповідь запрошеному не містить email ведучого. Тест: задача 3, `only the host invites, only their friends, and the invitee sees no email`.
3. **Відхилене запрошення не оживає** від повторного натискання ведучого. Позначка в меню зменшується одразу після відхилення, без переходу на іншу сторінку. Тести: задача 3, `a dismissed invite stays dismissed`; задача 4, `dismissing an invite updates the menu badge at once`.
4. **Порівняння не розкриває третіх осіб.** У спільній грі був третій гравець з акаунта: його нікнейм і id не потрапляють у відповідь. Гра, де був лише інший користувач без глядача, не рахується. Аноніму відповідь 401, на себе 400. Тест: задача 2, `versus is only about the viewer and that user`.
5. **Подвоєний учасник і нічия.** Людина увійшла в одну гру з двох пристроїв, або двоє посіли однакове місце: «разом» рахує гру один раз, нічия не йде нікому, частка правильних не подвоюється. Тест: задача 2, `a doubled participant counts once and a tie goes to nobody`.
6. **Камбек і бліц на межі.** Рівність балів у бліц-раунді не дає `blitz_win`. Камбек не рахується, якщо зіграно один раунд або гравець і так був першим. Штрафні рядки входять у суму раунду. Тест: задача 1, `blitz_win needs a strict lead and comeback needs to trail before the last round`.
7. **Телефон 375 px:** панель друзів у лобі, блок запрошень і блок «Ви і …» без горизонтальної прокрутки, а нижнє меню не закриває кінець сторінки. Тест: задача 6, `expectPhoneFit`.

---

### Задача 1. Вісім нових ачівок з історії

**Files:**
- Modify: `packages/shared/src/profile.ts` (`ACHIEVEMENTS`)
- Modify: `apps/server/src/history.ts` (нова `gameTables`, експорт `snapshotOf` не потрібен: використовується всередині)
- Modify: `apps/server/src/achievements.ts` (нові чисті функції, розширений `AchievementFacts`)
- Modify: `apps/server/src/profiles.ts` (`profileFacts` збирає нові факти)
- Create: `apps/server/src/testing/history-rows.ts` (вставка ігор у тестах)
- Modify (механічно): `apps/web/src/profile/AchievementList.tsx` (`ICONS`), `apps/web/src/i18n.ts` (`achievement_*`, `achievementHint_*`)
- Test: `apps/server/src/achievements.test.ts`, `apps/server/src/profiles.test.ts`, `apps/server/src/profile-routes.test.ts` (механічно 8 → 16)

**Interfaces:**
- Produces (`shared/profile.ts`):
  ```ts
  export const ACHIEVEMENTS = ['first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
    'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5'] as const;
  ```
- Produces (`history.ts`):
  ```ts
  export interface TableRow { roundIndex: number; attempt: number; accepted: boolean; points: number }
  export interface TablePlayer { participantId: string; userId: string | null; score: number; rank: number | null; rows: TableRow[] }
  /** Гра з усіма учасниками: для ачівок, що порівнюють гравців у межах раунду. */
  export interface GameTable {
    gameId: string;
    status: GameStatus;
    startedAt: string;
    /** Типи раундів зі знімка; [] — знімок не проходить схему. */
    roundTypes: Round['type'][];
    players: TablePlayer[];
  }
  /** Ігри за id (порядок не гарантовано), з усіма учасниками та їхніми рядками answer. */
  export async function gameTables(db: Db, gameIds: string[]): Promise<GameTable[]>;
  ```
  Три запити: `game` через `inArray`, `participant` через `inArray(gameId)`, `answer` через `inArray(participantId)`. Для `[]` запитів немає.
- Produces (`achievements.ts`):
  ```ts
  export interface AchievementFacts {
    games: number; wins: number; hosted: number; bestStreak: number; perfectGames: number;
    winStreak: number; blitzWins: number; finalHits: number; comebacks: number; friendsPlayedWith: number;
  }
  /** Найдовша серія перемог (isWin) серед завершених ігор за startedAt; незавершені пропускаються. */
  export function winStreak(games: PlayedGame[]): number;
  /** Сума points рядків учасника в раунді (зі штрафними). */
  export function roundPoints(player: TablePlayer, roundIndex: number): number;
  /** Учасник має строгу перевагу > 0 хоч в одному бліц-раунді гри з ≥ 2 учасниками. */
  export function wonBlitzRound(table: GameTable, participantId: string): boolean;
  /** У фінал-раунді є рядок учасника accepted && points > 0. */
  export function hitFinal(table: GameTable, participantId: string): boolean;
  /** isWin учасника, зіграно ≥ 2 раунди (за найбільшим roundIndex серед рядків усіх), і перед останнім зіграним хтось мав строго більше. */
  export function isComeback(table: GameTable, participantId: string): boolean;
  /** Різні userId (не userId і є в friendIds) серед учасників цих ігор. */
  export function friendsPlayedWith(tables: GameTable[], userId: string, friendIds: Set<string>): number;
  ```
  `isComeback` перевіряє `isWin` через поля таблиці: `status`, `rank`, `score`, `playerCount = players.length`, решта полів `Counted` для `isWin` не потрібна. Передати об'єкт з потрібними полями (`correct: 0`, `questionsPlayed: 0`).
- Produces (`testing/history-rows.ts`):
  ```ts
  export interface SeedPlayer { userId: string | null; nickname: string; score: number; rank: number | null;
    rows?: { questionIndex: number; roundIndex?: number; attempt?: number; accepted: boolean; points: number }[] }
  /** Вставляє гру з учасниками й рядками answer; повертає id гри й учасників у порядку players. */
  export async function seedGame(db: Db, game: { hostId: string; status?: GameStatus; startedAt: Date; snapshot?: unknown;
    questionsPlayed?: number; title?: string; players: SeedPlayer[] }): Promise<{ gameId: string; participantIds: string[] }>;
  ```
  Значення за замовчуванням: `status: 'finished'`, `snapshot: makeQuiz([single])`, `title: 'Гра'`, `questionsPlayed: 1`, `code` береться з лічильника, `payload: null`, `timeMs: 0`, `overridden: false`, `attempt: 0`, `roundIndex: 0`.

- [ ] **Step 1: Write the failing tests** в `achievements.test.ts`. Допоміжна функція `table(roundTypes, players)` будує `GameTable` у пам'яті.

```ts
describe('new achievements', () => {
  it('winStreak counts consecutive wins over finished games in start order and skips aborted ones', () => {
    const g = (i: number, rank: number, status: PlayedGame['status'] = 'finished') =>
      ({ ...played(status), gameId: `g${i}`, startedAt: new Date(i * 1000).toISOString(), rank, score: 10 });
    // Новіші першими, як віддає playerGames.
    expect(winStreak([g(5, 1), g(4, 1, 'aborted'), g(3, 1), g(2, 1), g(1, 2)])).toBe(3);
    expect(winStreak([g(3, 1), g(2, 2), g(1, 1)])).toBe(1);
    expect(winStreak([])).toBe(0);
  });

  it('blitz_win needs a strict lead and comeback needs to trail before the last round', () => {
    const row = (roundIndex: number, points: number, accepted = points > 0) => ({ roundIndex, attempt: 0, accepted, points });
    const p = (id: string, rank: number, score: number, rows: TableRow[]) => ({ participantId: id, userId: id, rank, score, rows });
    const blitz = table(['blitz', 'classic'], [p('a', 1, 30, [row(0, 20), row(1, 10)]), p('b', 2, 20, [row(0, 20)])]);
    expect(wonBlitzRound(blitz, 'a')).toBe(false); // 20 = 20
    const lead = table(['classic', 'blitz'], [p('a', 1, 30, [row(1, 30)]), p('b', 2, 10, [row(1, 20), row(1, -10, false)])]);
    expect(wonBlitzRound(lead, 'a')).toBe(true);
    expect(wonBlitzRound(table(['blitz'], [p('a', 1, 30, [row(0, 30)])]), 'a')).toBe(false); // сам

    const back = table(['classic', 'final'], [p('a', 1, 50, [row(0, 10), row(1, 40)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(back, 'a')).toBe(true);
    expect(hitFinal(back, 'a')).toBe(true);
    expect(hitFinal(back, 'b')).toBe(false);
    const ahead = table(['classic', 'final'], [p('a', 1, 50, [row(0, 30), row(1, 20)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(ahead, 'a')).toBe(false);
    const oneRound = table(['classic', 'final'], [p('a', 1, 30, [row(0, 30)]), p('b', 2, 20, [row(0, 20)])]);
    expect(isComeback(oneRound, 'a')).toBe(false);
  });

  it('friendsPlayedWith counts distinct friends other than the player', () => {
    const p = (userId: string | null) => ({ participantId: `${userId}-p`, userId, rank: null, score: 0, rows: [] });
    const tables = [table(['classic'], [p('me'), p('f1'), p('f2'), p(null)]), table(['classic'], [p('me'), p('f1'), p('x')])];
    expect(friendsPlayedWith(tables, 'me', new Set(['f1', 'f2', 'f3', 'me']))).toBe(2);
  });
});
```

  Тест `achievementsOf lists all eight…` перейменувати на `achievementsOf lists all sixteen in order with thresholds`. Порядок очікується за `ACHIEVEMENTS`. Порогові значення: `games 100`, `hosted 10`, `bestStreak 10`, `winStreak 3`, `blitzWins 1`, `finalHits 1`, `comebacks 1`, `friendsPlayedWith 5`. Тест `just below each threshold earns nothing` доповнити: 99, 9, 9, 2, 0, 0, 0, 4.

  У `profiles.test.ts`, `describe('profile facts')`, додати інтеграційний тест через базу:

```ts
it('profileFacts earns blitz, final, comeback and friends achievements from stored games', async () => {
  const ids = Array.from({ length: 7 }, () => randomUUID());
  const [hostId, me, ...others] = ids;
  await db.insert(user).values(ids.map((id) => ({ id, name: 'Гравець', email: `${id}@example.com` })));
  await db.insert(follow).values(others.map((followeeId) => ({ followerId: me, followeeId })));
  const snapshot = makeRoundsQuiz([blitzRound('b', [single]), finalRound('f', withId(single, 'f1'))]);
  await seedGame(db, {
    hostId, snapshot, startedAt: new Date(Date.UTC(2026, 0, 1)),
    players: [
      { userId: me, nickname: 'Я', score: 40, rank: 1, rows: [{ questionIndex: 0, roundIndex: 0, accepted: true, points: 10 }, { questionIndex: 1, roundIndex: 1, accepted: true, points: 30 }] },
      { userId: others[0], nickname: 'А', score: 20, rank: 2, rows: [{ questionIndex: 0, roundIndex: 0, accepted: true, points: 20 }] },
      ...others.slice(1).map((userId, i) => ({ userId, nickname: `Б${i}`, score: 0, rank: 3 + i })),
    ],
  });
  const earned = (await profileFacts(db, me)).achievements.filter((a) => a.earned).map((a) => a.id);
  expect(earned).toEqual(expect.arrayContaining(['final_hit', 'comeback', 'friends_5']));
  expect(earned).not.toContain('blitz_win');
});
```

  Шість інших гравців, усі з друзів: `friends_5` отримано. У бліці «А» має 20 проти 10, тож `blitz_win` немає. Перед фіналом «А» вела, тож камбек є.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/achievements.test.ts apps/server/src/profiles.test.ts`. Очікується FAIL: немає `winStreak`, `wonBlitzRound`, `seedGame`; ачівок 8.

- [ ] **Step 3: Implement** `ACHIEVEMENTS`, `gameTables`, функції `achievements.ts`, нові правила `EARNED`, `seedGame`. У `profileFacts`:
  - один раз завантажити `gameTables(db, games.map(g => g.played.gameId))`;
  - для кожної гри знайти учасника користувача (`userId === userId`; якщо їх кілька, взяти з найменшим `rank`, а `null` йде останнім) і порахувати `blitzWins`, `finalHits`, `comebacks`;
  - друзів узяти одним запитом `follow.followeeId where followerId = userId` (без `ensureProfile`, на відміну від `friendsOf`).

- [ ] **Step 4: Mechanical** у вебі:
  - `ICONS` у `AchievementList.tsx`: `games_100: '💯'`, `host_10: '🎙️'`, `streak_10: '⚡'`, `win_streak_3: '🥇'`, `blitz_win: '⏱️'`, `final_hit: '🎲'`, `comeback: '🚀'`, `friends_5: '🤝'`;
  - в `i18n.ts` назви з таблиці «Рішення плану» і підказки:
    - `achievementHint_games_100`: 'Зіграти 100 ігор';
    - `achievementHint_host_10`: 'Провести 10 ігор до кінця';
    - `achievementHint_streak_10`: 'Відповісти правильно на 10 запитань поспіль в одній грі';
    - `achievementHint_win_streak_3`: 'Перемогти в трьох завершених іграх поспіль';
    - `achievementHint_blitz_win`: 'Набрати в бліц-раунді більше балів, ніж будь-хто інший';
    - `achievementHint_final_hit`: 'Правильно відповісти у фіналі й виграти ставку';
    - `achievementHint_comeback`: 'Перемогти, якщо перед останнім раундом ви не були першим';
    - `achievementHint_friends_5`: 'Зіграти в одній грі з п’ятьма різними друзями (за весь час)'.
  
  У тестах `8 → 16`.

- [ ] **Step 5: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/profile.ts apps/server/src apps/web/src/profile/AchievementList.tsx apps/web/src/i18n.ts
git commit -m "feat: eight more achievements computed from game history"
```

---

### Задача 2. Порівняння «Ви і …» на сервері

**Files:**
- Create: `apps/server/src/versus.ts`, `apps/server/src/versus.test.ts`
- Modify: `packages/shared/src/profile.ts` (типи `Versus`, `VersusGame`)
- Modify: `apps/server/src/profile-routes.ts` (маршрут `GET /api/me/versus/:id`)
- Test: `apps/server/src/versus.test.ts`, `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Consumes: `playerGames` (`history.ts`), `gameStats` (`shared`), `seedGame` (задача 1; якщо задача 2 йде раніше, створити `seedGame` тут за тим самим інтерфейсом).
- Produces (`shared/profile.ts`; `index.ts` уже робить `export * from './profile'`):
  ```ts
  export interface VersusGame { gameId: string; title: string; startedAt: string; myRank: number | null; theirRank: number | null }
  /** Спільні завершені ігри того, хто дивиться («я»), і іншого користувача. */
  export interface Versus {
    together: number;
    /** Ігри, де моє місце краще (менше). */
    myAhead: number;
    theirAhead: number;
    myAccuracy: number | null;
    theirAccuracy: number | null;
    /** Найновіші першими, не більше VERSUS_RECENT. */
    recent: VersusGame[];
  }
  ```
- Produces (`versus.ts`):
  ```ts
  export const VERSUS_RECENT = 5;
  /** Найкращий за місцем запис на кожну гру (rank null — найгірший), порядок збережено. */
  export function bestPerGame(games: PlayedGame[]): PlayedGame[];
  export async function versusOf(db: Db, viewerId: string, otherId: string): Promise<Versus>;
  ```
- Маршрут: `GET /api/me/versus/:id` з `rateLimit: { max: 60, timeWindow: '1 minute', keyGenerator: versus:<userId або ip> }`.
  - 401 `unauthorized` без сесії.
  - 400 `self_versus`, якщо `id === user.id`.
  - 404 `not_found`, якщо `id.length > 64` або `ensureProfile` повертає null.
  - 200 і `Versus` в решті випадків.

- [ ] **Step 1: Write the failing tests** у `versus.test.ts` (база PGlite, `seedGame`):

```ts
it('counts shared finished games, who placed higher, accuracy and the latest games', async () => {
  // g1: я 1, він 2; g2: я 3, він 1; g3: перервана (не рахується); g4: лише він; g5: лише я.
  const v = await versusOf(db, me, him);
  expect(v).toEqual({
    together: 2, myAhead: 1, theirAhead: 1, myAccuracy: 50, theirAccuracy: 100,
    recent: [
      { gameId: g2, title: 'Друга', startedAt: expect.any(String), myRank: 3, theirRank: 1 },
      { gameId: g1, title: 'Перша', startedAt: expect.any(String), myRank: 1, theirRank: 2 },
    ],
  });
});

it('a doubled participant counts once and a tie goes to nobody', async () => {
  // Одна гра: у мене два учасники з місцями 2 і 4, у нього 2.
  expect(await versusOf(db, me2, him2)).toMatchObject({ together: 1, myAhead: 0, theirAhead: 0 });
});

it('keeps only the latest five shared games', async () => {
  // 7 спільних ігор
  expect((await versusOf(db, me3, him3)).recent.map((g) => g.title)).toEqual(['Гра 7', 'Гра 6', 'Гра 5', 'Гра 4', 'Гра 3']);
});
```

  Конкретні рядки `seedGame` записати так, щоб `questionsPlayed: 2` і рядки `accepted` давали 50 % і 100 %.

  У `profile-routes.test.ts`, новий `describe('versus')`:

```ts
it('versus is only about the viewer and that user', async () => {
  // Спільна гра Олени й Тараса з третім гравцем «Віра» (акаунт) — через seedGame з userId віри.
  expect((await request('GET', `/api/me/versus/${tarasId}`)).statusCode).toBe(401);
  expect((await request('GET', `/api/me/versus/${olenaId}`, olena.cookie)).json()).toEqual({ error: 'self_versus' });
  expect((await request('GET', '/api/me/versus/nobody', olena.cookie)).statusCode).toBe(404);
  const response = await request('GET', `/api/me/versus/${tarasId}`, olena.cookie);
  expect(response.statusCode).toBe(200);
  expect(Object.keys(response.json()).sort()).toEqual(['myAccuracy', 'myAhead', 'recent', 'theirAccuracy', 'theirAhead', 'together']);
  expect(Object.keys(response.json().recent[0]).sort()).toEqual(['gameId', 'myRank', 'startedAt', 'theirRank', 'title']);
  for (const secret of ['Віра', veraId, olena.email, taras.email]) expect(response.body).not.toContain(secret);
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/versus.test.ts apps/server/src/profile-routes.test.ts`. Очікується FAIL: немає `versusOf` і маршруту (404 на `/api/me/versus`).

- [ ] **Step 3: Implement** `versus.ts`. Порядок дій:
  1. `bestPerGame(await playerGames(db, viewerId, null))` з фільтром `status === 'finished'`.
  2. `Map` за `gameId` для другого користувача.
  3. Перетин у порядку першого списку: він уже найновіший першим.
  4. Лічильники й `gameStats(...).accuracy` для кожного боку.

  Додати маршрут і `err_self_versus: 'Порівняти себе з собою не можна.'` в `i18n.ts`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/profile.ts apps/server/src/versus.ts apps/server/src/versus.test.ts apps/server/src/profile-routes.ts apps/server/src/profile-routes.test.ts apps/web/src/i18n.ts
git commit -m "feat(server): compare yourself with another player over shared games"
```

---

### Задача 3. Запрошення на сервері

**Files:**
- Create: `apps/server/src/invites.ts`, `apps/server/src/invites.test.ts`
- Modify: `packages/shared/src/profile.ts` (тип `GameInvite`)
- Modify: `apps/server/src/app.ts` (створити `Invites`, зареєструвати маршрути, повернути `invites` із `buildApp`)
- Modify: `apps/server/src/profile-routes.ts` (`GET /api/me/friends`)
- Test: `apps/server/src/invites.test.ts`, `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Produces (`shared/profile.ts`):
  ```ts
  /** Запрошення в гру, що чекає в лобі. */
  export interface GameInvite { code: string; title: string; host: ProfileCard; invitedAt: string }
  ```
- Produces (`invites.ts`):
  ```ts
  export const MAX_INVITES_PER_ROOM = 30;
  export class Invites {
    constructor(manager: RoomManager); // підписується на onEvent: 'closed' або етап ≠ 'lobby' → забути кімнату
    /** Додає ще не запрошених і не відхилених, до MAX_INVITES_PER_ROOM; повертає всіх запрошених кімнати. */
    invite(room: Room, userIds: string[]): string[];
    invitedTo(room: Room): string[];
    /** Живі кімнати в лобі, куди запрошено користувача, без відхилених і тих, куди він уже приєднався; найновіші першими. */
    forUser(userId: string): { room: Room; at: number }[];
    dismiss(userId: string, code: string): void;
  }
  export interface InviteDeps { db: Db; manager: RoomManager; invites: Invites; currentUser: (request: FastifyRequest) => Promise<CurrentUser | null> }
  export async function registerInviteRoutes(app: FastifyInstance, deps: InviteDeps): Promise<void>;
  ```
  Сховище: `Map<room.id, { room: Room; users: Map<userId, at>; dismissed: Set<userId> }>`. Жива кімната означає `manager.get(room.code) === room && room.state.phase === 'lobby'`. Ключ саме `room.id`, а не код: код можуть видати новій кімнаті. `at` береться з `manager.now()`.
- Маршрути:
  - `POST /api/games/by-code/:code/invites`, тіло `z.object({ userIds: z.array(z.string().min(1).max(64)).min(1).max(30) }).strict()`, `rateLimit: 30/хв` з ключем `invite:<userId або ip>`.
    - 401 без сесії.
    - 404 `game_not_found`, якщо кімнати немає або `room.hostUserId !== user.id`.
    - 409 `wrong_phase` поза лобі.
    - 400 `invalid_payload` на хибне тіло.
    - Id, яких немає серед `follow.followeeId` ведучого, і власний id тихо відкидаються.
    - 200 і `{ invited: string[] }`.
  - `GET /api/games/by-code/:code/invites`: 401, 404 як вище; 200 і `{ invited: string[] }`, також поза лобі (тоді `[]`).
  - `GET /api/me/invites`, `rateLimit: 60/хв` з ключем `invites:<userId або ip>`.
    - 401 без сесії.
    - 200 і `GameInvite[]`: `forUser` з фільтром `isFollowing(db, room.hostUserId, user.id)`, а `host` береться з `ensureProfile(db, room.hostUserId)` як `{ id, nickname, avatar }`.
  - `DELETE /api/me/invites/:code`: 401 без сесії, інакше 204 завжди (також для невідомого коду).
  - `GET /api/me/friends` (у `profile-routes.ts`): 401 без сесії, інакше 200 і `friendsOf(db, user.id)`.

- [ ] **Step 1: Write the failing tests** в `invites.test.ts`. Налаштування як у `profile-routes.test.ts`:
  - `buildApp` з `FakeScheduler` (щоб промотати `LOBBY_TTL_MS`);
  - `signUp` ведучої «Галина», «Оля», «Тарас», «Віра»;
  - Галина підписана на Олю й Тараса через `follow`;
  - гру створює `startGame(ctx.app, makeQuiz([single]), galyna.cookie)`.

```ts
it('only the host invites, only their friends, and the invitee sees no email', async () => {
  const post = (cookie: string | undefined, userIds: string[]) => request('POST', `/api/games/by-code/${code}/invites`, cookie, { userIds });
  expect((await post(undefined, [olyaId])).statusCode).toBe(401);
  expect((await post(vira.cookie, [olyaId])).statusCode).toBe(404);
  expect((await request('GET', `/api/games/by-code/${code}/invites`, olya.cookie)).statusCode).toBe(404);
  const sent = await post(galyna.cookie, [olyaId, viraId, galynaId, olyaId]);
  expect(sent.json()).toEqual({ invited: [olyaId] });
  expect((await post(galyna.cookie, [])).statusCode).toBe(400);

  const mine = await request('GET', '/api/me/invites', olya.cookie);
  expect(mine.json()).toEqual([{ code, title: 'Тестова вікторина', host: { id: galynaId, nickname: 'Галина', avatar: null }, invitedAt: expect.any(String) }]);
  expect(mine.body).not.toContain(galyna.email);
  expect((await request('GET', '/api/me/invites', vira.cookie)).json()).toEqual([]);
  expect((await request('GET', '/api/me/invites')).statusCode).toBe(401);
});

it('invites vanish when the game starts or the room closes', async () => {
  // Гра A: запросити Олю, приєднати гравця, host start → GET /api/me/invites у Олі = []; POST → 409 wrong_phase.
  // Гра B: запросити Олю, scheduler.advance(LOBBY_TTL_MS) → [].
});

it('a reused code does not resurrect an old invite', async () => {
  // Кімната закрилась; rng/код новій кімнаті не підробляємо — перевіряємо через Invites напряму:
  // new Invites(manager); invite(oldRoom, [olyaId]); закрити oldRoom; forUser(olyaId) = [] навіть якщо manager.get(code) — інша кімната.
});

it('a dismissed invite stays dismissed and a joined friend no longer sees it', async () => {
  // Запросити Олю й Тараса; Оля DELETE /api/me/invites/:code → 204, її список []; ведучий запрошує її знову → Оля досі [].
  // Тарас приєднується з акаунта (POST join з його cookie) → його список [].
  // Ведучий відписується від Тараса в іншій кімнаті з запрошенням → у Тараса [].
});
```

  Для `a reused code…` у `RoomManager` немає способу видати той самий код. Тест робить так:
  1. створює дві кімнати;
  2. закриває першу через промотування TTL;
  3. перевіряє, що `forUser` не віддає закриту кімнату;
  4. перевіряє, що `invitedTo(second)` порожній.
  Цього досить, бо ключ — `room.id`.

  У `profile-routes.test.ts`:

```ts
it('the friends list is only for its owner', async () => {
  expect((await request('GET', '/api/me/friends')).statusCode).toBe(401);
  const response = await request('GET', '/api/me/friends', olena.cookie);
  expect(response.json()).toEqual([{ id: tarasId, nickname: 'Тарас', avatar: null }]);
  expect(response.body).not.toContain(taras.email);
});
```

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/invites.test.ts apps/server/src/profile-routes.test.ts`. Очікується FAIL: маршрути відповідають 404.

- [ ] **Step 3: Implement** `Invites`, `registerInviteRoutes` і `GET /api/me/friends`. У `buildApp`:

```ts
const invites = new Invites(manager);
await registerInviteRoutes(app, { db: options.db, manager, invites, currentUser });
// …
return { app, manager, io, recorder, invites };
```

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/profile.ts apps/server/src/invites.ts apps/server/src/invites.test.ts apps/server/src/app.ts apps/server/src/profile-routes.ts apps/server/src/profile-routes.test.ts
git commit -m "feat(server): invite friends to a lobby; invites live while the room waits"
```

---

### Задача 4. Запрошення у вебі: лобі, меню, профіль

**Files:**
- Modify: `apps/web/src/api.ts` (`getMyFriends`, `inviteFriends`, `getRoomInvites`, `getMyInvites`, `dismissInvite`)
- Create: `apps/web/src/useInvites.ts`, `apps/web/src/useInvites.test.tsx`
- Create: `apps/web/src/screens/InviteFriends.tsx`, `apps/web/src/screens/InviteFriends.test.tsx`
- Create: `apps/web/src/profile/InviteList.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx` (лобі), `apps/web/src/menu/Menu.tsx` (позначка), `apps/web/src/pages/Profile.tsx` (блок угорі), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/pages/Profile.test.tsx`, `InviteFriends.test.tsx`, `useInvites.test.tsx`

**Interfaces:**
- Consumes: маршрути задачі 3, тип `GameInvite`.
- Produces (`api.ts`):
  ```ts
  export const getMyFriends = () => fetchData<ProfileCard[]>('/api/me/friends');
  export const inviteFriends = (code: string, userIds: string[]) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`, { body: { userIds } });
  export const getRoomInvites = (code: string) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`);
  export const getMyInvites = () => fetchData<GameInvite[]>('/api/me/invites');
  export const dismissInvite = (code: string) => request<object>(`/api/me/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
  ```
- Produces (`useInvites.ts`):
  ```ts
  export const INVITES_POLL_MS = 30_000;
  export const INVITES_CHANGED = 'quiz:invites-changed';
  export function announceInvitesChanged(): void; // window.dispatchEvent(new Event(INVITES_CHANGED))
  /** Запрошення того, хто увійшов: запит на старті, за зміною refresh, кожні INVITES_POLL_MS при видимій вкладці і за INVITES_CHANGED. Вимкнено — []. Помилка — лишає попередній список. */
  export function useInvites(enabled: boolean, refresh?: unknown): GameInvite[];
  ```
- Produces: `<InviteFriends code={string} />`, `<InviteList invites={GameInvite[]} onDismissed={() => void} />`.
- Тексти (`i18n.ts`):
  - `inviteFriends: 'Запросити друзів'`;
  - `inviteClose: 'Згорнути'`;
  - `inviteOne: 'Запросити'`;
  - `invitedOne: 'Запрошено'`;
  - `noFriendsToInvite: 'Друзів поки немає. Додайте їх у профілі.'`;
  - `openProfile: 'Відкрити профіль'`;
  - `inviteHint: 'Запрошення бачать лише ваші друзі з акаунтом, поки гра не почалась.'`;
  - `invitesTitle: 'Вас запросили'`;
  - `inviteLine: '{host} запрошує: «{title}», код {code}'`;
  - `inviteJoin: 'Приєднатися'`;
  - `inviteDismiss: 'Відхилити'`;
  - `invitesBadge: 'Запрошень: {count}'`.

  Код у `inviteLine` форматується як на сцені: `${code.slice(0, 3)} ${code.slice(3)}`.

- [ ] **Step 1: Write the failing tests.**

  `InviteFriends.test.tsx` (мокує `getMyFriends`, `getRoomInvites`, `inviteFriends`):
  - `opens the friends list and invites one friend`: натиснути «Запросити друзів», з'являються «Оля» і «Тарас». Тарас уже в `invited`, тож його кнопка «Запрошено» неактивна. Натиснути «Запросити» біля Олі: `inviteFriends` викликано з `('123456', ['olya'])`, а кнопка стає «Запрошено» (`disabled`).
  - `without friends shows the hint and a profile link in a new tab`: посилання «Відкрити профіль» має `href="/profile"` і `target="_blank"`.
  - `shows the error text when inviting fails`: `inviteFriends` → `{ ok: false, error: 'wrong_phase' }` дає `role="alert"` з «Зараз цього зробити не можна.».

  `HostScreen.test.tsx`: `the invite button is only in the lobby`. «Запросити друзів» є на `lobby` і немає на `question`.

  `Menu.test.tsx` (мок додає `getMyInvites`, за замовчуванням `{ ok: true, data: [] }`):
  - `shows the number of invites on the profile item`: `getMyInvites` повертає два запрошення, тож в елементі з доступною назвою «Запрошень: 2» видно текст `2`. Для анонімного користувача `getMyInvites` не викликається.
  - `dismissing an invite updates the menu badge at once`: після `announceInvitesChanged()` хук запитує знову. Мок повертає `[]`, і позначка зникає.

  `useInvites.test.tsx` (фальшиві таймери):
  - `polls every 30 seconds while the tab is visible`: після `vi.advanceTimersByTime(30_000)` другий виклик. Коли `document.visibilityState` дорівнює `'hidden'` (через `Object.defineProperty`), виклику немає.

  `Profile.test.tsx` (мок додає `getMyInvites`, `dismissInvite`):
  - `shows invites at the top with join and dismiss`: є заголовок «Вас запросили» і рядок «Галина запрошує: «Кіно», код 123 456». Посилання «Приєднатися» має `href="/play/123456"`. «Відхилити» викликає `dismissInvite('123456')`, і рядок зникає.
  - Без запрошень блоку немає зовсім (`queryByRole('heading', { name: 'Вас запросили' })` дорівнює `null`).

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - **`InviteFriends`.** На відкритті паралельно `getMyFriends()` і `getRoomInvites(code)`. Кнопки в рядку блокуються, поки запит іде. Розмітка: `<section className="invite-panel">` з `<ul className="invite-friends">`, рядок `<li>` з `Avatar size="small"`, нікнеймом і кнопкою `btn btn-small`.
  - **`HostScreen`.** `{phase === 'lobby' && <InviteFriends code={code} />}` одразу після секції гравців лобі, перед `<nav className="links">`.
  - **`Menu`.** Використати `const invites = useInvites(account.status === 'signed-in', location.key)`. Пункт `PROFILE`, якщо `invites.length > 0`, дописує `<span className="menu-badge" aria-label={t('invitesBadge', { count })}>{count}</span>`.
  - **`Profile`.** `useInvites(true, version)` і `<InviteList>` одразу під шапкою (або редактором), перед «Статистикою». Після відхилення викликати `announceInvitesChanged()` і прибрати рядок локально.
  - **Стилі.**
    - `.menu-badge`: мінімум 1.25rem кружок, `background: var(--amber)`, `color: var(--stage)`, `font-weight: 700`.
    - `.invite-panel` і `.invite-list`: `border: 1px solid var(--line)`, `background: var(--panel)`.
    - Рядки з `flex-wrap: wrap` і `overflow-wrap: anywhere`: довга назва вікторини не має розпирати 375 px.
    - Поза мобільним `@media` позначка стоїть поруч із підписом. На телефоні в нижній панелі вона в правому верхньому куті іконки (`position: absolute` відносно `.menu a`, якому дати `position: relative`).

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): invite friends from the lobby; the badge and the invite block in the profile"
```

---

### Задача 5. Блок «Ви і …» на публічному профілі

**Files:**
- Create: `apps/web/src/profile/VersusBlock.tsx`
- Modify: `apps/web/src/api.ts` (`getVersus`), `apps/web/src/pages/PublicProfile.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/pages/PublicProfile.test.tsx`

**Interfaces:**
- Consumes: `GET /api/me/versus/:id`, тип `Versus` (задача 2), `formatDate` (`format.ts`), `countText`.
- Produces:
  ```ts
  export const getVersus = (id: string) => fetchData<Versus>(`/api/me/versus/${encodeURIComponent(id)}`);
  export function VersusBlock({ id, nickname }: { id: string; nickname: string }): JSX.Element;
  ```
- Тексти:
  - `versusTitle: 'Ви і {name}'`;
  - `versusNone: 'Ви ще не грали разом.'`;
  - `versusTogether_one: 'гра разом'`, `versusTogether_few: 'гри разом'`, `versusTogether_many: 'ігор разом'`;
  - `versusYouHigher: 'разів вище ви'`;
  - `versusTheyHigher: 'разів вище {name}'`;
  - `versusYourAccuracy: 'ваші правильні'`;
  - `versusTheirAccuracy: 'правильні {name}'`;
  - `versusRecent: 'Останні спільні ігри'`;
  - `versusGame: '{date} — «{title}»: ви — {mine}, {name} — {theirs}'`;
  - `versusNoPlace: 'без місця'`.

- [ ] **Step 1: Write the failing tests** у `PublicProfile.test.tsx` (мок додає `getVersus`, за замовчуванням дані з `together: 0`):
  - **`shows how the viewer compares with this player`.** `getVersus` → `{ together: 3, myAhead: 2, theirAhead: 1, myAccuracy: 80, theirAccuracy: 60, recent: [{ gameId: 'g1', title: 'Кіно', startedAt: '2026-10-20T18:00:00.000Z', myRank: 1, theirRank: 2 }] }`. Очікується:
    - заголовок «Ви і Тарас»;
    - статистика `3` / «гри разом», `2` / «разів вище ви», `1` / «разів вище Тарас», `80%`, `60%`;
    - рядок, що містить ««Кіно»: ви — 1 місце, Тарас — 2 місце».
  - **`a viewer who never played with them sees a short note`.** `together: 0` дає «Ви ще не грали разом.» без статистики.
  - **`no comparison for a visitor or on your own profile`.** `me` → `unauthorized`, тож `getVersus` не викликано й заголовка немає. Профіль `u1` очима `u1`: так само.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/PublicProfile.test.tsx`. Очікується FAIL.

- [ ] **Step 3: Implement.**
  - **`VersusBlock`.** Сам запитує `getVersus(id)` і перезапитує за зміною `id`. Поки завантаження йде або сталася помилка, нічого не показує (помилка не має ламати профіль). Статистика використовує ту саму розмітку `.stats` / `.stat`, що й `StatsView`: `dd` значення, `dt` підпис. «Останні» йдуть списком `ul.profile-list`.
  - **`PublicProfile`.** Додає `<section className="profile-section versus">` між «Статистикою» та «Ачівками», лише коли `account.status === 'signed-in' && !isOwner`.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): 'you and <nickname>' on a public profile"
```

---

### Задача 6. Наскрізний сценарій: запрошення, гра, порівняння

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it` і функція `invitesAndVersus`)

**Interfaces:**
- Consumes: `open`, `click`, `field`, `join`, `shot`, `expectPhoneFit`, `menuLinks`, `MENU`, `stat`, `makeQuiz`, `single`, `exact`, `problems` з того самого файлу.

- [ ] **Step 1: Write the scenario** `it('a host invites a friend from the lobby; the friend sees the badge, joins from the profile, and they compare', …)` з обгорткою `try / snapshot` як у сусідніх. Кроки:
  1. Ведуча `host9` (1280×900) реєструється як «Ніна Ведуча». Гравчиня `olya9` (375×812) реєструється як «Оксана Гравець» через меню «Увійти». Обидва id взяти з `GET /api/me` через `page.request`. Ведуча додає Оксану: `host.request.put(`${base}/api/me/friends/${olyaId}`)`.
  2. Ведуча зберігає `makeQuiz([single], { speedBonus: false })` з назвою «Вечір друзів» і тисне «Грати». На пульті `click(host, 'Запросити друзів')`, біля «Оксана» тисне «Запросити», чекає кнопку «Запрошено». `shot(host, 'invite-lobby-host')`. Пульт на 375 px: `host.setViewportSize({ width: 375, height: 812 })`, перевірити `document.documentElement.scrollWidth <= innerWidth`, `shot(host, 'invite-lobby-host-375')`, повернути 1280×900.
  3. Оксана `goto(base)`. У меню з'являється елемент з назвою «Запрошень: 1» (`olya.getByLabel('Запрошень: 1')`). `shot(olya, 'invite-badge-phone')`. Пункт «Профіль»: є заголовок «Вас запросили» і текст «Ніна запрошує: «Вечір друзів», код ### ###». `expectPhoneFit(olya, 'invite-profile-phone-375')`.
  4. Третій користувач «Віра» (`open('vira9', 390, 844)`, реєстрація через сторінку входу або `request.post('/api/auth/sign-up/email')`). Перевірки через API:
     - `GET /api/me/invites` дає `[]`;
     - `POST /api/games/by-code/${code}/invites` з `{ userIds: [olyaId] }` дає 404.
  5. Оксана тисне «Приєднатися», потрапляє на `/play/${code}`, вводить ім'я «Оксана», «Увійти в гру». Гравець-гість `taras9` (360×740) приєднується через `join`. Ведуча: «Почати гру», «Почати раунд». Оксана відповідає правильно, Тарас ні. Далі «Показати відповідь», «Далі», і на пульті з'являється етап фінішу (дочекатися як у `menuProfileFriends`). Після старту `olya.request.get('/api/me/invites')` дає `[]`.
  6. Ведуча відкриває `/profile/${olyaId}`. Оскільки ведуча не грала, блок «Ви і Оксана» показує «Ви ще не грали разом.».
  7. Друга гра, щоб було що порівнювати: ведуча знову тисне «Грати» на «Вечорі друзів», Оксана й Віра приєднуються за кодом з акаунтів (запрошення не потрібне), Оксана відповідає правильно, Віра хибно, гра доходить до фінішу. Після фінішу Оксана відкриває `/profile/${viraId}`. Очікується:
     - заголовок «Ви і Віра»;
     - `stat(olya, 'гра разом')` має текст `1гра разом`;
     - рядок «Останні спільні ігри» містить ««Вечір друзів»: ви — 1 місце, Віра — 2 місце».
     Далі `expectPhoneFit(olya, 'versus-phone-375')`. Віра на комп'ютері відкриває `/profile/${olyaId}`: `shot(vira, 'versus-desktop')`.
  8. Приватність через API:
     - анонімний `request.get('/api/me/versus/' + olyaId)` у новому контексті дає 401;
     - відповідь `GET /api/me/versus/${viraId}` для Оксани не містить «Тарас» і email-ів;
     - `GET /api/profiles/${olyaId}` досі має лише ключі `['achievements', 'avatar', 'following', 'id', 'nickname', 'stats']`.
  9. `expect(problems).toEqual([])`.

- [ ] **Step 2: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв, серед них наявного `menuProfileFriends` з 16 ачівками (рядок `10 ігор (ще не отримано)` лишається).

- [ ] **Step 3: Shots.** `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts`. Переглянути кадри `apps/server/e2e/artifacts/shots/`:
  - `invite-lobby-host`, `invite-lobby-host-375`;
  - `invite-badge-phone`, `invite-profile-phone-375`;
  - `versus-phone-375`, `versus-desktop`;
  - `profile-own-phone-375` (шістнадцять ачівок не розпирають сітку).

  Що перевірити: позначка читається і на телефоні, і на комп'ютері; немає горизонтальної прокрутки; кольори лише з токенів.

- [ ] **Step 4: Run** `pnpm vitest run --maxWorkers=2 && pnpm typecheck`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: invites from the lobby, the menu badge and 'you and …' end-to-end"
```
