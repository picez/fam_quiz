# План 14a: призи від ведучого й вітрина нагород (беклог #10 + #15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** уся специфікація `docs/superpowers/specs/2026-11-01-prizes-showcase-design.md`.
- Користувач з акаунтом має сторінку «Мої призи» (`/prizes`). Там він створює, змінює й видаляє призи з опцій: 3D-трофей і матеріал, гравіювання, справжній приз (текст і фото), титул, диплом.
- У лобі ведучий (у грі без ведучого — автор) кладе призи на 1-ше, 2-ге й 3-тє місця. Сцена й телефони показують «Граємо за: …».
- Фінал: церемонія 3 → 2 → 1 з конфеті й трофеєм, що обертається. Переможець на телефоні бачить свій приз і кнопку «Диплом».
- Вручений приз зникає зі складу й з'являється у вітрині «Нагороди» в профілі переможця. Титул 7 днів стоїть біля ніку.
- Обірвана гра чи переможець-гість повертають приз на склад.

**Spec:** `docs/superpowers/specs/2026-11-01-prizes-showcase-design.md`

**Передумова:** 13a і 13b уже в `main`. Міграції до `0020_saved_games` зайняті, наша — **`0021_prizes`**. Нові поля `Room` дописуються в обидва літерали (`open`, `restore`) і в `continueSaved` / `restartSaved`, поруч із полями 13b.

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 21.**
- У `GameState` немає жодного нового ключа. Призи лобі й титули живуть на рівні кімнати (`Room.prizes`, `Room.titles`), як `checkpoint` / `continued` у 13b.
- Переможців рахує сервер зі стану `finished` (`rankPlayers`), а церемонію клієнт грає сам із зрізу. Нового етапу рушія немає.
- `Room.prizes` іде в `live_room` **необов'язковим** полем конверта `SavedRoom` (`prizes?`). `SAVED_ROOM_VERSION` лишається 1.
  - Старий сервер (відкат) поле ігнорує: кімната встає без призів. Резерв у базі тоді знімає закриття кімнати чи прибирач на старті (`releasePrizes` бере id гри з бази, а не з `Room.prizes`).
- `restore.test.ts` не змінюється. Деплой живих ігор не обриває, тож перед пушем власника питати не треба. Правило «Push hold while playing» діє як завжди.

**Архітектура:**
- **База** (`apps/server/src/prizes.ts`, усі запити тут):
  - `prize` — склад, зі статусом `free` → `reserved` (`reserved_game`) → `awarded`;
  - `prize_award` — вручені екземпляри зі знімком змісту призу, ключ `(game_id, place, user_id)`;
  - `user_title` — один титул на акаунт.
- **Лобі.** `PUT /api/games/by-code/:code/prizes` резервує призи в базі (одна транзакція), а тоді `manager.setPrizes(room, placed)` кладе їх у кімнату. Звідти вони йдуть у зрізи всіх ролей (`view.prizes`).
- **Вручення.** Рекордер, у тій самій черзі й після `awardGame`, кличе `awardPrizes` з `prizeOutcome(room)`. Ідемпотентність тримає умовний перехід статусу `reserved → awarded` (повтор нічого не змінює) плюс унікальний ключ.
- **Повернення.**
  - Подія `closed` кімнати, що не дійшла до `finished` (а також `closed` із `saved`), іде в чергу рекордера як `releasePrizes(db, room.id)`.
  - `abandonRooms` (чистка доби, зламаний запис) теж кличе `releasePrizes`.
  - `RoomStore.boot()` кличе `releaseStalePrizes(db, idsOfLiveRooms)`.
- **Титули.** `attachTitles(manager, db)` на `changed` раз на кімнату й акаунт читає чинні титули й кладе їх у `room.titles` (`manager.setTitles`). Зріз несе `titles: { нік → титул }`.
- **Веб.**
  - Сторінка `/prizes` і пункт меню 🎁.
  - Панель «Призи гри» в лобі пульта й автора.
  - «Граємо за» на сцені й телефонах.
  - Компонент `Ceremony` (сцена й телефон) і картка «Твій приз».
  - Розділ «Нагороди» в профілі.
  - 3D — `@google/model-viewer`, що вантажиться лише динамічним `import()` у `apps/web/src/trophy/loadViewer.ts`.
  - Диплом — canvas → PNG, далі Web Share або завантаження файлом.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. **Нова залежність:** `@google/model-viewer` (^4) у `apps/web`, лише в лінивому чанку.

## Рішення (там, де специфікація лишила місце будівникові)

- **Назва призу.** Окрім опцій, приз має обов'язкову `name` (1–40 символів, напр. «Головний приз»). Без неї два «Золоті кубки» в списку лобі не розрізнити. Назву бачить лише власник (склад, лобі). Сцена й вітрина показують опції.
- **«Хоча б одна опція»** — це хоча б одне з: `trophy`, `engraving`, `real`, `title`, `diploma: true`. Матеріал структурно живе всередині `trophy` (`{ kind, material }`), тож без трофея його не буває. Типовий матеріал у редакторі — `gold`.
- **Ліміти (`PRIZE_LIMITS`):** `name` 40, `engraving` 80, `realText` 120, `title` 32, `perOwner` 50 призів на складі (`free` + `reserved`). Тексти проходять `isStorable`, а краї обрізаються, як нікнейм.
- **Зміна призу** можлива лише в статусі `free`. Інакше 409 `prize_in_game`: «Приз лежить у грі — зніми його з місця, щоб змінити.».
- **Видалення:**
  - `free` → видалити;
  - `reserved` у кімнаті цього процесу, що ще в лобі → `manager.unplacePrize`, тоді видалити;
  - `reserved` у кімнаті після старту, або рядок `live_room` з цим id є, а кімнати тут немає → 409 `prize_in_game`;
  - `reserved`, а кімнати немає ніде (застарілий резерв) → видалити;
  - `awarded` для власника — `not_found` (його вже немає на складі).
- **Адмінка (#23):** `deletePrize(db, manager, prizeId, ownerId: null)` видаляє будь-який приз у будь-якому статусі й знімає його з живої кімнати цього процесу в будь-якій фазі. Також є `listAllPrizes(db)` і `deleteAward(db, awardId)` для модерації вітрини. Маршрутів адмінки в цьому плані немає.
- **Місце.** Місце N — це N-й рядок `rankPlayers(state.players)`: бали, далі менший сумарний час, далі нік. Так нічию розв'язує порядок, а не спільний `rank`. Якщо учасників менше за місця, місце без учасника → приз повертається, церемонія це місце пропускає. Умови «бали > 0» немає (специфікація її не ставить). Але гра, що дійшла до `finished` без жодного зіграного запитання (`state.plays.length === 0`, «Завершити гру» одразу після старту), призів не дає: `prizeOutcome` повертає `[]`, і `awardPrizes` повертає всі резерви гри на склад.
- **Хто отримує.** Соло — `room.playerUsers.get(player.id)`. Командна гра — кожна людина з `teamMembers(state, teamId)` з акаунтом, і в кожного свій рядок `prize_award`. Приз списується один раз (`awarded`). Жодного акаунта на місці → `free`. Кого вилучили (kick), той не в стані, тож і не в таблиці.
- **Титул** = `content.title`. Кожен акаунт-отримувач отримує upsert `user_title` з `expires_at = awarded_at + TITLE_MS` (7 днів). Новий титул заміняє старий від будь-кого. Протермінований титул не показується й не видаляється.
- **`prize_award`** зберігає знімок: `content`, `quiz_title`, `nickname` (нік у грі, для диплома), `place`, `awarded_at`. `game_id` і `prize_id` — без FK, щоб вітрина пережила видалення гри чи призу. FK `user_id → user` `on delete cascade`.
- **Ключі титулів у зрізі** — нік людини (соло-гравець або людина команди). Тоді клієнт ставить титул і там, де id немає (лобі телефона — `lobby: string[]`). У рядках команд таблиці титул не ставиться (клієнт застосовує `titles` до `Standings` лише коли `teams === null`).
- **«Граємо за»:**
  - сцена — блок у лобі (під списком гравців) і на заставці першого раунду (`phase === 'intro' && view.round?.index === 0 && view.questionIndex === 0`);
  - телефон — один рядок «Граємо за: 🏆 Золотий кубок · 🍕 піца» на тих самих етапах;
  - пульт — панель «Призи гри» в лобі.
- **Хореографія церемонії** (`CEREMONY_MS = { step: 3500, winner: 6000 }`):
  - місця з переможцем по черзі 3 → 2 → 1, кожне `step`, переможець — `winner`;
  - далі на сцені звичайний п'єдестал і карусель 12d. Поки йде церемонія, карусель не монтується;
  - старт — коли зійшла заставка «Підсумки» (`useSplash` === null);
  - `prefers-reduced-motion`: подіум одразу з усіма місцями, без класів анімації й конфеті, трофей без `auto-rotate`; через `CEREMONY_MS.winner` — далі.
  - Телефон: той самий компонент `size="phone"`, а під ним, коли церемонія скінчилась, — картка «Твій приз» або підсумок місць.
- **Пульт у фіналі** бачить лише список «Призи: 1 — Оля, 2 — Петро (приз повернеться на склад: гість)». Церемонії на пульті немає.
- **3D:**
  - `@google/model-viewer`, елемент створюється імперативно (`document.createElement('model-viewer')` у `ref`), щоб не типізувати JSX;
  - моделі — `apps/web/public/models/{cup,medal,crown,star,statuette}.glb` (CC0, ≤ 400 КБ кожна), джерела й ліцензії — у `apps/web/public/models/CREDITS.txt`;
  - матеріал — `baseColorFactor` / `metallicFactor` / `roughnessFactor` усіх матеріалів моделі після `load`;
  - без WebGL (`canvas.getContext('webgl2') ?? getContext('webgl')` === null) чи коли модуль не завантажився — запасний значок-емодзі в кольорі матеріалу.
- **Диплом:**
  - canvas 1200 × 850: рамка в кольорі матеріалу (без трофея — золота), «Диплом», нік, «1 місце», назва вікторини, дата `dd.mm.yyyy` (Київ), гравіювання, значок трофея (емодзі);
  - кнопка «Диплом»: `navigator.canShare?.({ files })` → `navigator.share`, інакше завантаження `dyplom-<нік>.png`;
  - у вітрині — для нагород з `content.diploma`, на телефоні фіналу — для переможця з `diploma` (і для гостя теж).
- **Вітрина** — `showcase` у `PublicProfile` і `OwnProfile`: `{ title: { text, until } | null; awards: AwardCard[] }`, найновіші першими, не більше `SHOWCASE_MAX = 60`. Розділ «Нагороди» показується, лише коли є що показати.
- **Меню:** пункт «Призи» (🎁, `/prizes`) для входу з акаунтом, між «Історією» і «Ачівками». Тоді пунктів стане 6, і на 375 px меню має вміститись (див. Review Focus).
- **Нові коди помилок HTTP** (лише рядки; `ErrorCode` рушія не змінюється): `prize_taken`, `prize_in_game`, `too_many_prizes`. Тексти — `err_*` у `i18n.ts`.

## Глобальні обмеження

- **Анти-ціль:** приз не губиться. Після кожного шляху закриття він або `free` на складі власника, або `awarded` з рядками у вітрині, або (переможці — лише гості) знову `free`.
- **Анти-ціль:** приз не вручається двічі (командна гра, повтор запису, перезапуск із кімнатою у `finished`, відновлена гра 12r).
- **Анти-ціль:** церемонія не затримує й не ламає завершення гри чи запис історії. Збій `awardPrizes` іде в `onError` і повтор черги, але `awardGame` і запис гри вже відбулися.
- **Анти-ціль:** 3D-бібліотека не вантажиться на інших екранах. `@google/model-viewer` імпортує лише `apps/web/src/trophy/loadViewer.ts`, і лише динамічно.
- Склад належить `room.hostUserId` (ведучий; в автопілоті — автор). Кладе й бачить список лише він.
- Звуку немає. `prefers-reduced-motion` — див. рішення.
- `GAME_STATE_VERSION` 21 без змін; `restore.test.ts` без змін.
- Жодного контенту про росію (правило власника): e2e-вікторина — про Україну.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тон «ти», коротко. Меню на ігрові екрани не додаємо.
- Телефон 375 px без горизонтальної прокрутки; сцена 1280 × 720 без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 14a"`, **лише на передньому плані**. Кадри — `apps/server/e2e/artifacts/shots/p14a-*`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```
- Після останньої задачі й фінальної рецензії: злити в `main` і запушити (правило «Push after work»).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/prizes.ts` (новий), `prizes.test.ts` (новий), `views.ts`, `profile.ts`, `index.ts` | типи, схеми, константи, поля зрізів і профілю | 1 |
| `apps/server/drizzle/0021_prizes.sql` + `meta`, `src/db/schema.ts`, `src/prizes.ts` (новий), `src/prizes.test.ts` (новий) | таблиці; склад, резерв, повернення, видалення | 2 |
| `apps/server/src/prizes.ts`, `src/prizes.award.test.ts` (новий) | вручення, титули, вітрина | 3 |
| `apps/server/src/rooms/prizes.ts` (новий), `rooms/manager.ts`, `rooms/manager.prizes.test.ts` (новий) | призи й титули кімнати, місця, зрізи, знімок | 4 |
| `apps/server/src/recorder.ts`, `recorder.prizes.test.ts` (новий), `rooms/store.ts`, `saved-games.ts`, `rooms/store.prizes.test.ts` (новий), `src/titles.ts` (новий), `titles.test.ts` (новий), `app.ts` | вручення й повернення в черзі, прибирач, титули | 5 |
| `apps/server/src/prize-routes.ts` (новий), `prize-routes.test.ts` (новий), `app.ts`, `profiles.ts`, `profiles.test.ts` | маршрути складу й лобі, вітрина в профілі | 6 |
| `apps/web/package.json`, `public/models/*` (нові), `src/trophy/*` (нові), `src/i18n.ts` | 3D, запасний значок, диплом, лінивість | 7 |
| `apps/web/src/api.ts`, `pages/Prizes.tsx` (+ тест), `prizes/PrizeEditor.tsx` (+ тест), `AppRoutes.tsx`, `menu/Menu.tsx` (+ тест), `i18n.ts`, `styles.css` | «Мої призи», меню | 8 |
| `apps/web/src/screens/PrizePlaces.tsx` (+ тест), `screens/PlayingFor.tsx` (+ тест), `HostScreen.tsx`, `AuthorLobby.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `Standings.tsx` (+ тести), `i18n.ts`, `styles.css` | лобі, «Граємо за», титули біля ніків | 9 |
| `apps/web/src/trophy/Ceremony.tsx` (+ тест), `screens/MyPrize.tsx` (+ тест), `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `i18n.ts`, `styles.css` | церемонія, «Твій приз», підсумок на пульті | 10 |
| `apps/web/src/profile/Showcase.tsx` (+ тест), `pages/Profile.tsx`, `pages/PublicProfile.tsx` (+ тести), `i18n.ts`, `styles.css` | «Нагороди», титул у профілі | 11 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 14a | 12 |

## Порядок збирання

- 1 → 2 → 3 → 4 → 5 → 6 (shared і сервер по черзі: `prizes.ts`, `manager.ts`, `app.ts` спільні), далі 7 → 8 → 9 → 10 → 11 (веб: спільні `i18n.ts`, `styles.css`, `StageScreen.tsx`, `PlayerScreen.tsx`), і 12 останньою.
- **Навмисні зміни наявних очікувань** (лише ці; інший червоний старий тест рецензент розбирає як регресію):
  - тест меню (`Menu.test.tsx`) для входу з акаунтом очікує 6 пунктів із «Призи» на третьому місці після «Історії»;
  - тести, що порівнюють `ownProfile` / `publicProfile` повним `toEqual`, тепер мають `showcase: { title: null, awards: [] }`.

## На що дивитися рецензентові (Review Focus)

1. **Приз губиться на обриві.** Приз лежить у лобі, і далі одне з: кімнату прибирає TTL лобі, автор закриває кімнату, ведучий тисне «Зберегти й продовжити пізніше» (13b) посеред гри, процес падає до запису `live_room`. Щоразу приз знову `free` на складі ведучого (на старті сервера — через прибирача). Тест — задачі 5, 2.
2. **Подвійне вручення.**
   - Повтор черги після збою `awardPrizes` посередині;
   - перезапуск, після якого кімната встає вже у `finished` (рекордер забуває `awarded`);
   - командна гра з трьома акаунтами.
   - Щоразу один перехід `awarded`, по одному рядку на `(game, place, user)` і один `user_title` на акаунт. Тест — задачі 3, 5.
3. **Той самий приз у двох лобі** (дві вкладки, дві кімнати): друге `PUT …/prizes` → 409 `prize_taken`, а перша кімната свого не втрачає. Той самий id на двох місцях однієї кімнати → 400. Чужий приз → 409 `prize_taken` (не розкриваємо, що він існує). Тест — задачі 2, 6.
4. **Телефон 375 px:**
   - меню з шістьма пунктами не прокручується вбік;
   - редактор призу, церемонія з довгим гравіюванням (80 символів) і довгою назвою вікторини, вітрина з трофеями — без прокрутки вбік.
   - Тест — задачі 8, 10, 12 (`expectNoSideScroll`).
5. **3D там, де не треба, і без WebGL.** Лобі, гра, «Мої призи» без прев'ю — жодного запиту на чанк model-viewer чи `.glb`. Без WebGL — значок-емодзі й жодної помилки в консолі. Тест — задачі 7, 12.

---

### Задача 1. Shared: типи призів, схеми, константи, поля зрізів і профілю

**Files:**
- Create: `packages/shared/src/prizes.ts`, `packages/shared/src/prizes.test.ts`
- Modify: `packages/shared/src/views.ts`, `packages/shared/src/profile.ts`, `packages/shared/src/index.ts`

**Interfaces:**
- Produces (`packages/shared/src/prizes.ts`):
  ```ts
  export const TROPHY_KINDS = ['cup', 'medal', 'crown', 'star', 'statuette'] as const;
  export type TrophyKind = (typeof TROPHY_KINDS)[number];
  export const TROPHY_MATERIALS = ['bronze', 'silver', 'gold', 'diamond'] as const;
  export type TrophyMaterial = (typeof TROPHY_MATERIALS)[number];
  export type PrizePlace = 1 | 2 | 3;
  export const PRIZE_LIMITS = { name: 40, engraving: 80, realText: 120, title: 32, perOwner: 50 } as const;
  export const TITLE_MS = 7 * 24 * 60 * 60_000;
  export const CEREMONY_MS = { step: 3500, winner: 6000 } as const;
  export const SHOWCASE_MAX = 60;

  export interface PrizeContent {
    name: string;
    trophy: { kind: TrophyKind; material: TrophyMaterial } | null;
    engraving: string | null;
    real: { text: string; photoUrl: string | null } | null;
    title: string | null;
    diploma: boolean;
  }
  /** Тексти: обрізані краї, стиснуті пробіли, isStorable, межі PRIZE_LIMITS; photoUrl — IMAGE_URL; refine 'prize_empty' — жодної опції. */
  export const prizeContentSchema: z.ZodType<PrizeContent>;
  export type PrizeStatus = 'free' | 'reserved';
  /** Приз складу для власника. */
  export interface PrizeItem { id: string; content: PrizeContent; status: PrizeStatus; createdAt: string }
  /** Тіло PUT …/prizes: id призу (uuid) чи null для кожного з трьох місць; не-null різні (refine 'prize_twice'). */
  export const placesSchema: z.ZodType<{ places: [string | null, string | null, string | null] }>;
  /** GET …/by-code/:code/prizes: що можна покласти (free + свої в цій кімнаті) і що лежить зараз. */
  export interface PrizePlacesInfo { options: PrizeItem[]; places: [string | null, string | null, string | null] }
  /** Приз на місці кімнати (сервер; і в знімку кімнати). */
  export interface PlacedPrize { place: PrizePlace; id: string; content: PrizeContent }
  export const placedPrizeSchema: z.ZodType<PlacedPrize>;
  export interface PrizeWinner { name: string; members: string[] }
  /** Зріз: зміст без name (назву бачить лише власник); winner — лише у finished, null — на місці нікого немає. */
  export interface PrizeShown { place: PrizePlace; content: Omit<PrizeContent, 'name'>; winner: PrizeWinner | null }
  export interface PrizesView {
    places: PrizeShown[];
    /** Лише телефон у finished: місце цієї людини (соло — свій рядок, команда — команда людини); account — чи піде у вітрину. */
    mine: { place: PrizePlace; account: boolean } | null;
  }
  export interface AwardCard { id: string; place: PrizePlace; content: Omit<PrizeContent, 'name'>; quizTitle: string; nickname: string; awardedAt: string }
  export interface Showcase { title: { text: string; until: string } | null; awards: AwardCard[] }
  /** Без name: зміст для сцени й вітрини. */
  export function publicContent(content: PrizeContent): Omit<PrizeContent, 'name'>;
  ```
- `views.ts`: до `BaseView` додаються два необов'язкові поля з коментарем «ставить сервер, рушій ключа не ставить»: `prizes?: PrizesView` і `titles?: Record<string, string>` (нік людини → титул).
- `profile.ts`: `PublicProfile.showcase: Showcase`, `OwnProfile.showcase: Showcase`.

- [ ] **Step 1: Write the failing tests** — `packages/shared/src/prizes.test.ts`:
  - `prizeContentSchema`:
    - `{ name: '  Головний  приз ', trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false }` → ok, `name === 'Головний приз'`;
    - усі опції порожні (`trophy null, engraving null, real null, title null, diploma false`) → помилка з `message === 'prize_empty'`;
    - лише `diploma: true` → ok;
    - `engraving` на 81 символ → помилка; на 80 → ok;
    - `real: { text: 'Піца 🍕', photoUrl: '/uploads/' + 'a'.repeat(32) + '.jpg' }` → ok; `photoUrl: 'https://x/y.jpg'` → помилка;
    - `trophy: { kind: 'vase', … }` → помилка; `name: ''` → помилка.
  - `placesSchema`: `[a, null, b]` → ok; `[a, a, null]` → `prize_twice`; `[a, null]` (довжина 2) → помилка; не-uuid → помилка; зайвий ключ → помилка (`.strict()`).
  - `placedPrizeSchema`: `place: 4` → помилка.
  - `publicContent(c)` не має ключа `name`, а решта збігається.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/prizes.test.ts` → FAIL (модуля немає).
- [ ] **Step 3: Implement** `prizes.ts` (текстові поля — той самий прийом, що `nicknameSchema`: `transform` + `pipe`, `isStorable`), експорт з `index.ts`, поля у `views.ts` і `profile.ts`. Якщо `typecheck` падає на місцях, що будують `OwnProfile` / `PublicProfile`, тимчасово поставити там `showcase: { title: null, awards: [] }` (справжнє значення — задача 6).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src/profiles.ts
  git commit -m "feat(shared): prizes groundwork — prize content with trophy, material, engraving, real prize, title and diploma, places of a lobby, the prizes and titles of a view, and the showcase of a profile

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. База: таблиці, склад, резерв, повернення, видалення

**Files:**
- Create: `apps/server/drizzle/0021_prizes.sql` + `meta/0021_snapshot.json`, `_journal.json` (з `apps/server`: `pnpm exec drizzle-kit generate --name prizes`), `apps/server/src/prizes.ts`, `apps/server/src/prizes.test.ts`
- Modify: `apps/server/src/db/schema.ts`

**Interfaces:**
- `schema.ts` (коментар над кожною таблицею — беклог 10/15):
  ```ts
  export const prize = pgTable('prize', {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<PrizeContent>().notNull(),
    status: text('status').$type<'free' | 'reserved' | 'awarded'>().notNull().default('free'),
    /** id гри (= room.id), за якою зарезервовано; null — не зарезервовано. */
    reservedGame: uuid('reserved_game'),
    createdAt: at('created_at').notNull(),
    updatedAt: at('updated_at').notNull(),
  }, (table) => [index('prize_owner_idx').on(table.ownerId), index('prize_reserved_idx').on(table.reservedGame)]);
  export const prizeAward = pgTable('prize_award', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    prizeId: uuid('prize_id').notNull(),
    gameId: uuid('game_id').notNull(),
    place: integer('place').$type<PrizePlace>().notNull(),
    content: jsonb('content').$type<PrizeContent>().notNull(),
    quizTitle: text('quiz_title').notNull(),
    nickname: text('nickname').notNull(),
    awardedAt: at('awarded_at').notNull(),
  }, (table) => [uniqueIndex('prize_award_once').on(table.gameId, table.place, table.userId), index('prize_award_user_idx').on(table.userId)]);
  export const userTitle = pgTable('user_title', {
    userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    gameId: uuid('game_id').notNull(),
    awardedAt: at('awarded_at').notNull(),
    expiresAt: at('expires_at').notNull(),
  });
  ```
- Produces (`apps/server/src/prizes.ts`):
  ```ts
  export function listPrizes(db: Db, ownerId: string): Promise<PrizeItem[]>; // free + reserved, найновіші першими
  export function createPrize(db: Db, ownerId: string, content: PrizeContent): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'too_many_prizes' }>;
  /** Лише free і свій; reserved → prize_in_game; немає / чужий / awarded → not_found. */
  export function updatePrize(db: Db, ownerId: string, id: string, content: PrizeContent): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'not_found' | 'prize_in_game' }>;
  /** Правила видалення з «Рішень»; ownerId null — адмінка (будь-який приз, знімає з кімнати в будь-якій фазі). */
  export function deletePrize(db: Db, manager: RoomManager, id: string, ownerId: string | null): Promise<'deleted' | 'not_found' | 'prize_in_game'>;
  /** Адмінка: усі призи з власником і статусом (і awarded). */
  export function listAllPrizes(db: Db): Promise<(PrizeItem & { ownerId: string; status: 'free' | 'reserved' | 'awarded'; reservedGame: string | null })[]>;
  /**
   * Одна транзакція: свої призи цієї гри, яких немає в ids, → free; ids → reserved за gameId, якщо вони свої й (free або вже за gameId).
   * Не всі ids узялись → відкат і prize_taken. Повертає PlacedPrize[] у порядку місць.
   */
  export function reservePlaces(db: Db, ownerId: string, gameId: string, places: [string | null, string | null, string | null]): Promise<{ ok: true; placed: PlacedPrize[] } | { ok: false; error: 'prize_taken' }>;
  /** Резерви гри → free (reserved_game null). awarded не чіпає. */
  export function releasePrizes(db: Db, gameId: string): Promise<void>;
  /** Старт сервера: reserved з reserved_game поза keep → free. */
  export function releaseStalePrizes(db: Db, keep: string[]): Promise<number>;
  ```
- Consumes: `RoomManager.rooms()`, `manager.unplacePrize(room, id)` (задача 4; до неї `deletePrize` у тесті бере менеджер без кімнат, а знімання з кімнати перевіряє задача 6). `liveRoom` — для «кімната деінде».

- [ ] **Step 1: Write the failing tests** — `apps/server/src/prizes.test.ts` (`createTestDb`, користувачі `u1`, `u2` вставкою в `user`, `new RoomManager(new FakeScheduler())`):
  - `createPrize` → `status 'free'`, у `listPrizes(u1)`; 51-й приз → `too_many_prizes`; `listPrizes(u2)` порожній.
  - `updatePrize`: free → нова назва; чужий → `not_found`; після `reservePlaces` → `prize_in_game`.
  - `reservePlaces(u1, g1, [a, null, b])` → `placed` з місцями 1 і 3, статус обох `reserved`, `reserved_game = g1`.
  - Повтор `reservePlaces(u1, g1, [b, a, null])` → ok (свої в цій грі беруться ще раз), `b` на 1-му, `a` на 2-му.
  - `reservePlaces(u1, g1, [a, null, null])` → `b` знову `free`.
  - `reservePlaces(u1, g2, [a, …])`, поки `a` за `g1` → `prize_taken`, а `a` лишився за `g1`. Транзакція відкочена: інші призи `g2` теж не змінились.
  - `reservePlaces(u2, g3, [a, …])` (чужий) → `prize_taken`.
  - `releasePrizes(g1)` → усі призи `g1` `free`; рядок зі статусом `awarded` (вставлений напряму) лишається `awarded`.
  - `releaseStalePrizes([g1])`: призи за `g1` лишаються, за `g2` → `free`, повертає 1.
  - `deletePrize`:
    - free → `deleted`;
    - reserved, кімнати немає ніде → `deleted`;
    - reserved, а в `live_room` є рядок з `room_id` = гра → `prize_in_game`;
    - чужий → `not_found`;
    - адмінка (`ownerId null`) видаляє і reserved, і awarded.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/prizes.test.ts` → FAIL.
- [ ] **Step 3: Implement**: згенерувати міграцію, додати в SQL коментар `-- Призи ведучого й вітрина (беклог 10, 15): склад, вручені екземпляри, титули.`, `schema.ts`, функції `prizes.ts`. У `deletePrize` кімнату шукати так: `manager.rooms().find((r) => r.id === reservedGame)`. Гілку «в лобі цього процесу» поки лишити з викликом `manager.unplacePrize`. Якщо задача 4 ще не злита, метод оголосити в менеджері заглушкою, що лише прибирає з `room.prizes`, — задача 4 його доповнить.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): prize storage — migration 0021 adds prize, prize_award and user_title; create, edit and delete prizes, reserve them for a game in one transaction, give them back to the owner, and sweep stale reservations

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. База: вручення, титули, вітрина

**Files:**
- Modify: `apps/server/src/prizes.ts`
- Create: `apps/server/src/prizes.award.test.ts`

**Interfaces:**
- Produces (`apps/server/src/prizes.ts`):
  ```ts
  /** Що дає місце (задача 4 рахує з кімнати). winners — акаунти людей місця з ніком у грі; [] — гості чи нікого. */
  export interface PrizeOutcome { place: PrizePlace; prizeId: string; winners: { userId: string; nickname: string }[] }
  export interface AwardInput { gameId: string; quizTitle: string; at: Date; outcomes: PrizeOutcome[] }
  /**
   * Для кожного outcome — своя транзакція:
   *  winners порожній → prize free (лише якщо reserved за gameId);
   *  інакше update prize set status 'awarded', reserved_game null where id, status 'reserved', reserved_game = gameId returning content;
   *  рядка немає (уже вручено / знято / видалено) → нічого; є → prize_award для кожного winner (onConflictDoNothing на prize_award_once)
   *  і, якщо content.title, upsert user_title (text, gameId, awardedAt at, expiresAt at + TITLE_MS).
   * Наприкінці releasePrizes(gameId): резерви гри, яких немає в outcomes (кімната без prizes після відкату), повертаються.
   */
  export function awardPrizes(db: Db, input: AwardInput): Promise<void>;
  /** Чинні титули (expires_at > now): userId → текст. */
  export function currentTitles(db: Db, userIds: string[], now?: Date): Promise<Map<string, string>>;
  /** Вітрина: чинний титул і нагороди (найновіші першими, не більше SHOWCASE_MAX), зміст — publicContent. */
  export function showcaseOf(db: Db, userId: string, now?: Date): Promise<Showcase>;
  /** Адмінка: прибрати рядок вітрини. */
  export function deleteAward(db: Db, awardId: string): Promise<boolean>;
  ```

- [ ] **Step 1: Write the failing tests** — `apps/server/src/prizes.award.test.ts`. Призи `u1` резервуються через `reservePlaces` під гру `g1`, отримувачі — `u2`, `u3`, `u4`:
  - **Соло:** `awardPrizes({ outcomes: [{ place: 1, prizeId: cup, winners: [{ userId: u2, nickname: 'Оля' }] }] })`:
    - `cup.status === 'awarded'`, у `listPrizes(u1)` його немає;
    - `showcaseOf(u2).awards` — один запис з `place 1`, `nickname 'Оля'`, `quizTitle`, без `name` у змісті.
  - **Повтор того самого виклику** → рядків `prize_award` так само 1, `user_title` один.
  - **Команда:** три winners → три рядки `prize_award`, приз `awarded` один раз.
  - **Гість:** `winners: []` → приз `free`, `reserved_game null`, рядків немає.
  - **Титул:**
    - `content.title '👑 Король вікторини'` → `currentTitles([u2])` має його;
    - другий приз з іншим титулом від `u3` → у `u2` новий титул;
    - `now` = `at + TITLE_MS + 1` → порожньо, а `showcaseOf(u2, now).title === null`.
  - **Залишок:** приз `b` зарезервовано за `g1`, але він не в `outcomes` → після `awardPrizes` він `free`.
  - **Знятий приз:** outcome для призу, якого вже немає (адмінка видалила) → без помилки й без рядків.
  - `showcaseOf` повертає не більше `SHOWCASE_MAX` (вставити 61 рядок напряму), найновіші першими. `deleteAward` прибирає рядок.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/prizes.award.test.ts` → FAIL.
- [ ] **Step 3: Implement** функції в `prizes.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): awarding prizes — an idempotent step per place moves the prize from reserved to awarded once, gives every account of the place its own showcase copy and the title for 7 days, and gives guest-only places back to the owner

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. Менеджер: призи й титули кімнати, місця, зрізи, знімок

**Files:**
- Create: `apps/server/src/rooms/prizes.ts`, `apps/server/src/rooms/manager.prizes.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`

**Interfaces:**
- `Room` (+ обидва літерали, `continueSaved`, `restartSaved` — порожні значення):
  ```ts
  /** Призи на місцях (10): кладе лише ведучий/автор у лобі; резерв — у базі. Іде в знімок кімнати. */
  prizes: PlacedPrize[];
  /** Чинні титули акаунтів кімнати (15): userId → текст. Лише в пам'яті; заповнює attachTitles. */
  titles: Map<string, string>;
  ```
- `SavedRoom.prizes?: PlacedPrize[]` (порожній масив у знімок не пишеться). `restore` бере лише елементи, що проходять `placedPrizeSchema`.
- Produces (`apps/server/src/rooms/prizes.ts`, чисті функції):
  ```ts
  export interface PlaceHolder { place: PrizePlace; participantId: string; name: string; people: { id: string; nickname: string }[] }
  /** Перші три рядки rankPlayers(state.players); соло — people [гравець], команда — teamMembers(state, id). */
  export function placeHolders(state: GameState): PlaceHolder[];
  /** Лише finished і state.plays.length > 0 (інакше []): для кожного room.prizes — winners з playerUsers (людина без акаунта не входить). */
  export function prizeOutcome(room: Room): PrizeOutcome[];
  /** Зріз призів для ролі; undefined — призів немає. winner лише у finished; mine — лише гравцеві у finished. */
  export function prizesView(room: Room, viewer: { role: 'host' | 'stage' } | { role: 'player'; playerId: string }): PrizesView | undefined;
  /** Нік людини → титул: люди стану (соло — players, команда — members) з акаунтом і титулом у room.titles; порожньо → undefined. */
  export function titlesView(room: Room): Record<string, string> | undefined;
  ```
- Produces (`RoomManager`):
  ```ts
  /** Лише лобі (інакше wrong_phase), frozen → restarting; кладе placed, emit changed. */
  setPrizes(room: Room, placed: PlacedPrize[]): AckResult;
  /** Будь-яка фаза: прибрати приз з місця; emit changed, якщо щось змінилось. */
  unplacePrize(room: Room, prizeId: string): void;
  /** Злити титули (null — прибрати); emit changed, якщо щось змінилось. */
  setTitles(room: Room, titles: Map<string, string | null>): void;
  ```
- `view()` додає до зрізу host / stage / player `prizes` і `titles`, коли вони не `undefined` (як `continued` у 13b: розгортанням, без ключа, коли порожньо).

- [ ] **Step 1: Write the failing tests** — `manager.prizes.test.ts` (`RoomManager` + `FakeScheduler`, `makeQuiz`, `single`; кімната ведучого `u1`; Оля з акаунтом `u2`, Петро гість, Ірина `u3`):
  - `setPrizes` у лобі → `ok`, `view(host).prizes.places` має місця з `winner: null` і без `name`. Зріз сцени й телефону — те саме, `mine === null`.
  - `setPrizes` після `start` → `wrong_phase`; після `freeze()` → `restarting`.
  - **Місця з нічиєю:** Оля й Ірина з однаковими балами, Ірина швидша → `placeHolders` дає Ірину на 1-му.
  - Гра до `finished` (Оля 1-ша, Петро 2-й, Ірина 3-тя; призи на 1 і 2):
    - `prizeOutcome` → `[{ place: 1, winners: [{ userId: 'u2', nickname: 'Оля' }] }, { place: 2, winners: [] }]`;
    - зріз Олі: `mine = { place: 1, account: true }`; Петра: `{ place: 2, account: false }`; Ірини: `null`;
    - `winner.name` на 1-му — «Оля», `members` порожній.
  - **Два гравці, приз на 3-му** → `winner: null`, `prizeOutcome` для 3-го — `winners: []`.
  - **Вилучений** (kick до фіналу) у `placeHolders` не входить.
  - `finished` без жодного зіграного запитання → `prizeOutcome` повертає `[]`.
  - **Командна гра** (`startTeamGame` з `testing/team-game.ts`): `winner.members` — ніки людей команди; `prizeOutcome` має акаунт кожної людини з акаунтом; `mine` людини переможної команди — місце команди.
  - `unplacePrize` у грі → місце зникає зі зрізу.
  - `setTitles(new Map([['u2', '👑 Король']]))` → `view(stage).titles` = `{ 'Оля': '👑 Король' }`; гість не входить; `setTitles(new Map([['u2', null]]))` → `titles` немає.
  - `snapshot(room).prizes` = покладені; `restore(snapshot)` → ті самі `room.prizes`; зіпсований елемент (`place: 7`) відкидається; знімок без призів не має ключа `prizes`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.prizes.test.ts` → FAIL.
- [ ] **Step 3: Implement** `rooms/prizes.ts` (`rankPlayers`, `teamsOn`, `teamMembers`, `memberOf` з `@quiz/engine`, `publicContent` з shared) і зміни менеджера.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (зокрема `manager.restore.test.ts` і `manager.continue.test.ts` без змін очікувань).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): prizes in the room — the host places prizes in the lobby, views carry the places and, at the finish, the winners in table order with the time tie-break; titles of accounts next to nicknames; prizes survive a restart in the room snapshot without a game state bump

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. Вручення й повернення в черзі рекордера, прибирач, титули

**Files:**
- Modify: `apps/server/src/recorder.ts`, `apps/server/src/rooms/store.ts`, `apps/server/src/saved-games.ts`, `apps/server/src/app.ts`
- Create: `apps/server/src/recorder.prizes.test.ts`, `apps/server/src/rooms/store.prizes.test.ts`, `apps/server/src/titles.ts`, `apps/server/src/titles.test.ts`

**Interfaces:**
- Рекордер:
  - у `record` знімок отримує `prizes: PrizeOutcome[] | null` (`prizeOutcome(room)` у `finished` — навіть з порожнім `room.prizes`, бо `awardPrizes` з `[]` повертає залишки резервів після відкату; поза `finished` — `null`) і `quizTitle: state.quiz.title`;
  - у `job`, **після** `awardGame` і `awarded.add`: `if (snapshot.prizes !== null && !prized.has(room.id)) { await awardPrizes(db, { gameId: room.id, quizTitle, at: new Date(), outcomes: snapshot.prizes }); prized.add(room.id); }`. Нова множина `prized` чиститься там само, де `awarded` (`forget`, `adopt`);
  - у `onEvent` на `closed`, якщо `room.state.phase !== 'finished'` і `room.hostUserId !== null`, у ту саму чергу кімнати ставиться `releasePrizes(db, room.id)`. Гра у `finished` без запитань дає `outcomes: []`, тож `awardPrizes` теж повертає її резерви з тими самими повторами (збій → `onError` і повтор, як у `persistSaved`). Для `closed` із `saved` — після `persistSaved`. На `moved` нічого не робиться.
- `saved-games.ts` `abandonRooms`: після обробки кожного рядка (у `try`) — `await releasePrizes(db, row.roomId)`.
- `RoomStore.boot()`: після `adopt()` — `await releaseStalePrizes(this.db, ids)`, де `ids` = `room_id` усіх рядків `live_room` (після чистки й піднімання).
- Produces (`apps/server/src/titles.ts`):
  ```ts
  /** На changed: акаунти room.playerUsers, яких ця кімната ще не питала (WeakMap<Room, Set<string>>), → currentTitles → manager.setTitles. Збій → onError, акаунт питається ще раз на наступному changed. */
  export function attachTitles(manager: RoomManager, db: Db, onError?: (error: unknown) => void): { idle(): Promise<void> };
  ```
- `app.ts`: `attachTitles(manager, options.db)` поруч з `attachRecorder`; `idle` титулів чекати в `shutdown` після `recorder.idle()`.

- [ ] **Step 1: Write the failing tests:**
  - `recorder.prizes.test.ts` (`createTestDb`, `RoomManager` + `FakeScheduler`, `attachRecorder`, `recorder.idle()`; ведучий `u1` з двома призами через `reservePlaces` і `manager.setPrizes`; Оля `u2`, Петро гість):
    - **Гра до фінішу:** кубок `awarded`, `showcaseOf(u2)` має його, медаль (місце Петра) `free`. `game.status === 'finished'` і ачівки записані (порядок: `awardGame` до `awardPrizes` — шпигун `vi.spyOn` на обидва).
    - **Збій `awardPrizes` раз** (мок кидає на першому виклику) → після повтору кубок вручено один раз, `prize_award` один рядок, гра `finished`.
    - **Перезапуск після фінішу:** `snapshot` → новий менеджер → `restore` → `recorder.idle()` → рядків `prize_award` так само 1.
    - **Кімната закрита в лобі** (`manager` закриває за TTL лобі через `scheduler.advance`) → обидва призи `free`.
    - **«Завершити гру» одразу після старту** (`finished` без жодного запитання) → обидва призи `free`, рядків `prize_award` немає.
    - **13b: «Зберегти й продовжити пізніше»** посеред гри → `free`, а гра `saved`.
  - `store.prizes.test.ts` (за зразком `store.saved.test.ts`):
    - `boot()`: приз за грою, якої немає в `live_room` → `free`; приз за кімнатою, що встала з `live_room` → лишається `reserved`;
    - `abandonRooms` (чистка доби) → резерв гри `free`.
  - `titles.test.ts`: `user_title` для `u2` вставлено напряму → Оля входить у кімнату → після `idle()` `view(stage).titles` = `{ 'Оля': … }`. Другий `changed` базу вже не питає (шпигун на `currentTitles` — 1 виклик). Протермінований титул → `titles` немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/recorder.prizes.test.ts apps/server/src/rooms/store.prizes.test.ts apps/server/src/titles.test.ts` → FAIL.
- [ ] **Step 3: Implement** зміни рекордера, `abandonRooms`, `boot`, `titles.ts`, `app.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (зокрема `recorder.test.ts`, `recorder.saved.test.ts`, `store*.test.ts` без змін очікувань).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): prizes follow the game — the recorder awards them after the history and achievements in the same retrying queue, a room closed before the finish (lobby timeout, end, save for later, purge) gives them back, the boot sweeper frees stale reservations, and titles of accounts reach the room

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Маршрути складу й лобі, вітрина в профілі

**Files:**
- Create: `apps/server/src/prize-routes.ts`, `apps/server/src/prize-routes.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/src/profiles.ts`, `apps/server/src/profiles.test.ts`

**Interfaces:**
- `registerPrizeRoutes(app, { db, manager, locate, currentUser })`. Без входу → 401 `unauthorized`, тіло не за схемою → 400 `invalid_payload` (для `prize_empty` / `prize_twice` — теж 400 з цим кодом).

| Маршрут | Відповідь |
|---|---|
| `GET /api/me/prizes` | `PrizeItem[]` |
| `POST /api/me/prizes` | 201 `PrizeItem`; 409 `too_many_prizes` |
| `PUT /api/me/prizes/:id` | `PrizeItem`; 404 `not_found`; 409 `prize_in_game` |
| `DELETE /api/me/prizes/:id` | 204; 404; 409 `prize_in_game` |
| `GET /api/games/by-code/:code/prizes` | `PrizePlacesInfo`; 404 `game_not_found`, коли кімнати немає або `room.hostUserId !== user.id` (як `resume`); 503 `restarting` |
| `PUT /api/games/by-code/:code/prizes` | `PrizePlacesInfo`; 409 `wrong_phase` поза лобі; 409 `prize_taken` |

- `PUT …/prizes` по черзі:
  1. `locate`;
  2. власник;
  3. `phase === 'lobby'`;
  4. `reservePlaces`;
  5. `manager.setPrizes`. Якщо він не `ok` (гра стартувала, поки чекали базу), то `reservePlaces(…, room.prizes ids)` повертає резерви до того, що лежить у кімнаті, і відповідь — 409 `wrong_phase`.
- `options` у `GET` — `listPrizes(user)`, відфільтрований до `free` і тих, чий id лежить у `room.prizes`.
- `profiles.ts`: `ownProfile` і `publicProfile` додають `showcase: await showcaseOf(db, id)`.

- [ ] **Step 1: Write the failing tests** — `prize-routes.test.ts` (`buildApp` з `TEST_AUTH`, `signUp`, `startGame` з `testing/accounts.ts`):
  - CRUD: `POST` → 201; `GET` має його; `PUT` → нова назва; `DELETE` → 204, далі `GET` порожній. Чужий `PUT` / `DELETE` → 404. Без cookie → 401. `{ …, trophy: null, engraving: null, real: null, title: null, diploma: false }` → 400.
  - Лобі:
    - `PUT …/prizes` `{ places: [a, null, b] }` → 200, а зріз сцени (`manager.view`) має місця 1 і 3;
    - гравець без акаунта шле той самий запит → 404;
    - після «Почати гру» → 409 `wrong_phase`;
    - друга кімната того ж ведучого з `a` → 409 `prize_taken`, перша свого не втрачає;
    - `[a, a, null]` → 400.
  - `DELETE /api/me/prizes/a`, поки `a` лежить у лобі → 204 і зріз сцени без `a`. Після старту → 409 `prize_in_game`. `PUT /api/me/prizes/a`, поки він у лобі → 409 `prize_in_game`.
  - Автопілот: автор (`createAutopilot` через `POST /api/games` з `autopilot: true`) кладе призи тим самим маршрутом → 200.
  - `profiles.test.ts`: `GET /api/profiles/:id` і `/api/me/profile` мають `showcase` (порожній — `{ title: null, awards: [] }`; після `awardPrizes` — нагорода і титул).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/prize-routes.test.ts apps/server/src/profiles.test.ts` → FAIL.
- [ ] **Step 3: Implement** `prize-routes.ts` (ліміт частоти як у `CODE_LIMIT` для `by-code`, 30/хв для запису складу), реєстрація в `app.ts`, `showcase` у профілях.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): prize routes — the owner's store («Мої призи»), placing prizes on places 1–3 of a lobby with the race against the start handled, deleting a prize from a lobby takes it off the place, and profiles carry the showcase and the current title

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Веб: 3D-трофей, запасний значок, диплом, лінивість

**Files:**
- Modify: `apps/web/package.json` (`pnpm --filter @quiz/web add @google/model-viewer`), `apps/web/src/i18n.ts`
- Create: `apps/web/public/models/{cup,medal,crown,star,statuette}.glb`, `apps/web/public/models/CREDITS.txt`, `apps/web/src/trophy/trophy-meta.ts`, `trophy/loadViewer.ts`, `trophy/TrophyView.tsx`, `trophy/TrophyView.test.tsx`, `trophy/diploma.ts`, `trophy/diploma.test.ts`, `trophy/lazy.test.ts`

**Interfaces:**
- `trophy-meta.ts`:
  ```ts
  export const TROPHY_EMOJI: Record<TrophyKind, string>; // cup 🏆, medal 🏅, crown 👑, star 🌟, statuette 🎖️
  export const MATERIAL_LOOK: Record<TrophyMaterial, { color: string; metallic: number; roughness: number }>;
  // bronze #B0703A 1 0.35; silver #C9CED6 1 0.25; gold #E8B84A 1 0.2; diamond #CFEFFF 0 0.02
  export function trophyLabel(trophy: { kind: TrophyKind; material: TrophyMaterial }): string; // t(): «Золотий кубок», «Срібна медаль», …
  export function prizeSummary(content: Omit<PrizeContent, 'name'>): string; // «🏆 Золотий кубок · 🍕 Піца» для «Граємо за»
  ```
- `loadViewer.ts`: `export function loadViewer(): Promise<boolean>` — один раз `import('@google/model-viewer')` (кеш обіцянки); збій → `false`. `export function webglAvailable(): boolean`.
- `TrophyView.tsx`:
  ```ts
  export function TrophyView(props: { trophy: { kind: TrophyKind; material: TrophyMaterial }; size: 'stage' | 'phone' | 'card'; spin: boolean; interactive: boolean }): JSX.Element;
  ```
  - Спершу (і без WebGL чи після `loadViewer() === false`) — `<span className="trophy-fallback" style={{ color }}>{emoji}</span>` з `aria-label` = `trophyLabel`.
  - Коли модуль готовий — `model-viewer` створюється в `ref` з `src=/models/<kind>.glb`, `auto-rotate` (якщо `spin && !reducedMotion()`), `camera-controls` (якщо `interactive`), `disable-zoom`. На `load` колір і металевість ставляться всім `model.materials`.
- `diploma.ts`:
  ```ts
  export interface DiplomaData { nickname: string; place: PrizePlace; quizTitle: string; date: Date; engraving: string | null; trophy: { kind: TrophyKind; material: TrophyMaterial } | null }
  /** Рядки диплома зверху вниз (без порожніх): «Диплом», нік, «1 місце», назва вікторини, гравіювання, дата dd.mm.yyyy (Europe/Kyiv). */
  export function diplomaLines(data: DiplomaData): string[];
  export function diplomaFileName(nickname: string): string; // dyplom-<нік з заміною всього, крім літер і цифр, на ->.png
  export function renderDiploma(data: DiplomaData): Promise<Blob>; // canvas 1200 × 850, рамка в кольорі MATERIAL_LOOK (без трофея — gold)
  /** canShare({ files }) → share; інакше завантаження через <a download>. Скасування share (AbortError) — не помилка. */
  export function shareDiploma(blob: Blob, fileName: string): Promise<'shared' | 'downloaded'>;
  ```

- [ ] **Step 1: Write the failing tests:**
  - `TrophyView.test.tsx` (`vi.mock('./loadViewer')`):
    - `webglAvailable() → false` → видно `.trophy-fallback` з «🏆» і `aria-label` «Золотий кубок», а `loadViewer` не викликано;
    - `loadViewer → Promise<false>` → лишається значок;
    - `loadViewer → true` → у DOM є `model-viewer` з `src` `/models/medal.glb`;
    - `spin` + `matchMedia` reduce → без атрибута `auto-rotate`; `interactive: false` → без `camera-controls`.
  - `diploma.test.ts`:
    - `diplomaLines` для `{ nickname: 'Оля', place: 1, quizTitle: 'Новорічна вікторина', date: 2026-12-31T22:30Z, engraving: 'Чемпіон 2026', trophy }` → `['Диплом', 'Оля', '1 місце', 'Новорічна вікторина', 'Чемпіон 2026', '01.01.2027']` (київська дата);
    - без гравіювання рядка немає;
    - `diplomaFileName('Оля Петрівна!')` → `'dyplom-Оля-Петрівна.png'`;
    - `shareDiploma`: з `navigator.canShare → true` і `share` — `'shared'`; без `canShare` — `'downloaded'` і клік по `<a download>`; `share` кидає `AbortError` → `'shared'` без помилки.
  - `lazy.test.ts`: обійти всі `apps/web/src/**/*.{ts,tsx}` (`node:fs`). Рядок `@google/model-viewer` трапляється лише в `src/trophy/loadViewer.ts` і лише у вигляді `import('@google/model-viewer')` (жодного статичного `import … from`).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy` → FAIL.
- [ ] **Step 3: Моделі.** Для кожного з п'яти видів знайти GLB з ліцензією **CC0**: Poly Pizza з фільтром CC0 (автори Kenney, Quaternius) або паки Kenney. Ліцензію перевірити на сторінці самої моделі. Файл ≤ 400 КБ, інакше стиснути через `npx gltf-transform optimize`. У `CREDITS.txt` для кожного файла: назва, автор, URL, «CC0 1.0». Якщо для якогось виду CC0-моделі немає, не підставляти моделі з іншою ліцензією, а повернути контролеру `NEEDS_CONTEXT` з переліком знайденого.
- [ ] **Step 4: Implement** `trophy-meta.ts`, `loadViewer.ts`, `TrophyView.tsx`, `diploma.ts`; тексти в `i18n.ts`:
  - назви трофеїв і матеріалів у формі «Золотий кубок / Срібна медаль / Бронзова корона / Діамантова зірка / Золота статуетка» (узгодження роду — таблицею в `trophy-meta.ts`);
  - `diplomaTitle` «Диплом»;
  - `diplomaPlace` «{place} місце».
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`, потім `pnpm --filter @quiz/web build` → PASS. Головний `dist/assets/index-*.js` не містить рядка `model-viewer` (`grep -L`), а окремий чанк — містить.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web pnpm-lock.yaml
  git commit -m "feat(web): trophies and diplomas — CC0 trophy models shown with model-viewer loaded lazily only where a trophy is on screen, material as colour and metalness, an emoji fallback without WebGL, and a canvas diploma shared through Web Share or downloaded

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 8. Веб: «Мої призи» і пункт меню

**Files:**
- Create: `apps/web/src/pages/Prizes.tsx`, `pages/Prizes.test.tsx`, `apps/web/src/prizes/PrizeEditor.tsx`, `prizes/PrizeEditor.test.tsx`
- Modify: `apps/web/src/api.ts`, `apps/web/src/AppRoutes.tsx`, `apps/web/src/menu/Menu.tsx`, `menu/Menu.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `api.ts`: `myPrizes()`, `createPrize(content)`, `updatePrize(id, content)`, `deletePrize(id)`, `gamePrizes(code)`, `placePrizes(code, places)` — на маршрути задачі 6, типи з shared.
- `PrizeEditor`:
  ```ts
  export function PrizeEditor(props: { initial: PrizeContent | null; busy: boolean; onSave: (content: PrizeContent) => void; onCancel: () => void }): JSX.Element;
  ```
  - Поле «Назва» і шість перемикачів-опцій (чекбокси): «3D-трофей» (вид — радіо з `TROPHY_EMOJI`, матеріал — радіо), «Гравіювання», «Справжній приз» (текст + `ImageField` з `editor/ImageField.tsx` для фото), «Титул біля ніку», «Диплом».
  - Рядок «Церемонія у фіналі — завжди, коли в грі є приз» (не перемикач).
  - Кнопка «Зберегти» вимкнена, доки `prizeContentSchema.safeParse` не ok. Під формою — текст першої помилки (`prize_empty` → «Увімкни хоча б одну опцію.»).
  - Прев'ю трофея — `TrophyView` `size="card"`, лише коли увімкнено «3D-трофей».
- `Prizes` (`/prizes`): заголовок «Мої призи», кнопка «Новий приз», список карток (назва, `prizeSummary`, позначка «У грі» для `reserved`, кнопки «Змінити» (вимкнена для `reserved`) і «Видалити» з `confirm`). Порожній список — «Призів ще немає. Створи перший — і клади його на місця в лобі.». Без входу — перехід на `/login?next=/prizes`.
- Меню: `PRIZES_ITEM = { label: 'menuPrizes', icon: '🎁', to: '/prizes', active: under('/prizes') }` між `HISTORY` і `ACHIEVEMENTS_ITEM`.
- Тексти (`i18n.ts`): `menuPrizes` «Призи», `prizesTitle`, `prizeNew`, `prizeName`, `prizeOptTrophy`, `prizeOptEngraving`, `prizeOptReal`, `prizeOptTitle`, `prizeOptDiploma`, `prizeCeremonyNote`, `prizeInGame` «У грі», `prizesEmpty`, `prizeDeleteConfirm`, `err_prize_empty`, `err_prize_taken` «Цей приз уже лежить в іншій грі.», `err_prize_in_game`, `err_too_many_prizes` «На складі вже 50 призів.».

- [ ] **Step 1: Write the failing tests:**
  - `PrizeEditor.test.tsx`:
    - без опцій «Зберегти» вимкнена й видно «Увімкни хоча б одну опцію.»;
    - «Диплом» → увімкнена;
    - «3D-трофей» → видно вибір виду й матеріалу, типовий матеріал «Золото», `onSave` отримує `trophy: { kind: 'cup', material: 'gold' }`;
    - вимкнений «Справжній приз» дає `real: null`, навіть коли текст був уведений;
    - гравіювання на 81 символ не дається ввести (`maxLength`).
  - `Prizes.test.tsx` (мок `../api`): список з двох, у `reserved` — «У грі» і вимкнена «Змінити»; «Видалити» з `confirm` → `deletePrize`, картка зникає; 409 `prize_in_game` → текст помилки; «Новий приз» → редактор → `createPrize`.
  - `Menu.test.tsx`: з акаунтом — 6 пунктів, «Призи» третій і `aria-current` на `/prizes`; гість «Призів» не бачить.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/Prizes.test.tsx apps/web/src/prizes apps/web/src/menu` → FAIL.
- [ ] **Step 3: Implement** `api.ts`, `PrizeEditor`, `Prizes`, маршрут `/prizes` усередині `WithMenu`, меню, тексти, стилі. На 375 px меню з шістьма пунктами вміщається: за потреби підпис ховається й лишається значок з `aria-label`, як уже робить `.menu` на вузьких екранах (перевірити в `styles.css`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): «Мої призи» — a menu page where the owner creates, edits and deletes prizes from optional parts (3D trophy and material, engraving, real prize with a photo, title, diploma) with a lazy trophy preview

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 9. Веб: призи в лобі, «Граємо за», титули біля ніків

**Files:**
- Create: `apps/web/src/screens/PrizePlaces.tsx`, `PrizePlaces.test.tsx`, `apps/web/src/screens/PlayingFor.tsx`, `PlayingFor.test.tsx`
- Modify: `apps/web/src/screens/HostScreen.tsx`, `AuthorLobby.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `Standings.tsx`, `StageTeams.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `PrizePlaces`:
  ```ts
  export function PrizePlaces(props: { code: string }): JSX.Element | null;
  ```
  - `gamePrizes(code)` під час монтування. Порожні `options` і `places` → рядок «Призів ще немає» з посиланням `/prizes` (відкривається в новій вкладці, `target="_blank"`, щоб не закрити пульт).
  - Три `<select>` («1 місце», «2 місце», «3 місце») з «— без призу —» і назвами. Приз, вибраний на одному місці, на інших вимкнений.
  - Кнопка «Покласти призи» → `placePrizes`, далі стан з відповіді; помилка — `errorText`.
- `PlayingFor`:
  ```ts
  export function PlayingFor(props: { prizes: PrizesView; size: 'stage' | 'phone' }): JSX.Element;
  ```
  - stage — заголовок «Граємо за» і по рядку на місце: «1» + `TROPHY_EMOJI` + `trophyLabel` + справжній приз + титул (без 3D: лобі й заставка лишаються легкими);
  - phone — один рядок `t('playingFor', { list })`, де `list` — `prizeSummary` місць через « · ».
- Вставки:
  - пульт — у лобі під `InviteFriends`;
  - `AuthorLobby` — під QR;
  - сцена — `Lobby` (під `roster`) і `Intro`, коли `view.round?.index === 0 && view.questionIndex === 0`;
  - телефон — лобі й та сама заставка;
  - усюди лише за `view.prizes !== undefined && view.prizes.places.length > 0`.
- Титули:
  - `Standings` отримує `titles?: Record<string, string>` і, коли `teams` немає, після ніку ставить `<span className="nick-title">{title}</span>`;
  - `StageTeams` і людські списки лобі (чипи сцени, `view.lobby` телефона, гравці пульта) — так само за ніком.
  - Передається `view.titles` з усіх місць, де стоїть `<Standings`.
- Тексти: `prizePlaces` «Призи гри», `prizePlace` «{place} місце», `prizeNone` «— без призу —», `prizePut` «Покласти призи», `prizesNoneYet`, `playingForTitle` «Граємо за», `playingFor` «Граємо за: {list}».

- [ ] **Step 1: Write the failing tests:**
  - `PrizePlaces.test.tsx` (мок `../api`): три селекти з назвами; приз, вибраний на 1-му, вимкнений на 2-му; «Покласти призи» шле `['a', null, null]`; 409 `prize_taken` → «Цей приз уже лежить в іншій грі.»; порожній склад → посилання «Мої призи».
  - `PlayingFor.test.tsx`: stage з двома місцями — «Граємо за», «Золотий кубок», «Піца 🍕», «👑 Король вікторини»; phone — один рядок «Граємо за: 🏆 Золотий кубок · 🍕 Піца».
  - `StageScreen.test.tsx`: лобі з `prizes` → «Граємо за»; заставка 1-го раунду з `prizes` → є; заставка 2-го → немає; лобі з `titles: { 'Оля': '👑 Король' }` → «👑 Король» біля «Оля».
  - `PlayerScreen.test.tsx`: лобі з `prizes` → рядок «Граємо за: …»; без `prizes` — немає.
  - `HostScreen.test.tsx`: лобі → «Призи гри»; поза лобі — немає.
  - `Standings`: з `titles` і `teams: null` — титул біля ніку; з командами — у рядку команди немає.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement** компоненти, вставки, тексти, стилі (`.nick-title` — дрібний шрифт, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, `max-width: 12ch` на телефоні).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): prizes in the lobby — the host or the author puts prizes on places 1–3, the stage and the phones show «Граємо за» in the lobby and at the first round intro, and current titles stand next to nicknames in lobbies and tables

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 10. Веб: церемонія, «Твій приз», підсумок на пульті

**Files:**
- Create: `apps/web/src/trophy/Ceremony.tsx`, `trophy/Ceremony.test.tsx`, `apps/web/src/screens/MyPrize.tsx`, `screens/MyPrize.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `Ceremony`:
  ```ts
  /** Місця з winner по черзі 3 → 2 → 1 (CEREMONY_MS.step, переможець — winner); hold — заставка ще йде, таймери стоять; onDone — раз. */
  export function Ceremony(props: { prizes: PrizesView; size: 'stage' | 'phone'; hold: boolean; onDone: () => void }): JSX.Element;
  ```
  - Розмітка: `.podium` з трьома стовпцями (2 — 1 — 3). Відкритий стовпець має `is-shown`, поточний — `is-now`. У ньому:
    - нік (`winner.name`) і `members` дрібно;
    - `TrophyView` (`spin`, без `interactive` на сцені, `interactive` на телефоні);
    - табличка гравіювання (`.engraving`);
    - справжній приз (фото `<img>` + текст);
    - титул.
  - Конфеті — 24 `<span className="confetti">` на кроці переможця.
  - `reducedMotion()` → усі місця одразу `is-shown`, без `.confetti`, без `is-now`; `onDone` через `CEREMONY_MS.winner`.
  - Місць з переможцем немає → `onDone` одразу (і нічого не показано).
- `MyPrize`:
  ```ts
  /** Телефон у finished: «Твій приз» для prizes.mine; кнопка «Диплом» — якщо content.diploma; гість — «Ти граєш як гість: у вітрину приз не потрапить.». */
  export function MyPrize(props: { prizes: PrizesView; nickname: string; quizTitle: string }): JSX.Element | null;
  ```
  «Диплом» → `renderDiploma` з `date: new Date()` → `shareDiploma`; поки триває — кнопка вимкнена, збій → «Не вдалося зробити диплом.».
- Сцена:
  - `StandingsBoard` у `finished` з місцями з переможцем: спершу `Ceremony` (`hold = splashing`), а після `onDone` (стан `ceremonyDone` у `StageScreen`) — п'єдестал і `AwardsCarousel`, як досі.
  - Сцена 1280 × 720 без прокрутки: на сцені фото справжнього призу ≤ 160 px заввишки.
- Телефон у `finished` з місцями: `Ceremony size="phone"`, далі `MyPrize` (якщо `mine`) і таблиця як досі.
- Пульт у `finished`: список «{place} місце — {name}» (`prizeResult`), а для `winner === null` — «{place} місце — нікого, приз повернеться на склад» (`prizeNobody`). Чи переможець гість, зріз пульта не каже: повернення гостьового призу видно на складі.
- Тексти: `ceremonyPlace` «{place} місце», `myPrizeTitle` «Твій приз», `diplomaButton` «Диплом», `diplomaFailed`, `myPrizeGuest`, `prizeResultsTitle` «Призи», `prizeResult`, `prizeNobody` «{place} місце — нікого, приз повернеться на склад».

- [ ] **Step 1: Write the failing tests:**
  - `Ceremony.test.tsx` (`vi.useFakeTimers`, мок `TrophyView` на значок):
    - три місця → спершу видно лише 3-тє; через 3500 мс — 2-ге; ще через 3500 — 1-ше з `.confetti`; ще через 6000 — `onDone` один раз;
    - `hold: true` → за 10 с нічого не відкрилось;
    - лише 1-ше місце → одразу 1-ше, `onDone` через 6000;
    - reduce → усе одразу, без `.confetti`, `onDone` через 6000;
    - жодного переможця → `onDone` одразу;
    - гравіювання, фото (`img[src="/uploads/…"]`) і титул видно в стовпці свого місця.
  - `MyPrize.test.tsx`: `mine` з `diploma` → «Твій приз» і «Диплом»; клік → `renderDiploma` з ніком і назвою вікторини, далі `shareDiploma` (обидва мок); `account: false` → нотатка гостя (кнопка «Диплом» є); без `diploma` — кнопки немає; `mine: null` → нічого.
  - `StageScreen.test.tsx`: `finished` з `prizes` → `.podium`; після `onDone` (таймери) — заголовок «П'єдестал»; без `prizes` — п'єдестал одразу, як досі.
  - `PlayerScreen.test.tsx`: `finished` з `mine` → після церемонії «Твій приз».
  - `HostScreen.test.tsx`: `finished` з `prizes` → «Призи» і «1 місце — Оля».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/screens` → FAIL.
- [ ] **Step 3: Implement** компоненти, вставки, тексти, стилі (анімації — `@keyframes` у `styles.css`, вимкнені в `@media (prefers-reduced-motion: reduce)`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): the prize ceremony — after the «Підсумки» splash the stage and the phones raise the podium 3, 2, then the winner with confetti and a spinning trophy beside the engraving, the real prize and the title; the winner's phone shows «Твій приз» with the diploma; calm without motion

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 11. Веб: вітрина «Нагороди» й титул у профілі

**Files:**
- Create: `apps/web/src/profile/Showcase.tsx`, `profile/Showcase.test.tsx`
- Modify: `apps/web/src/pages/Profile.tsx`, `pages/PublicProfile.tsx`, `pages/Profile.test.tsx`, `pages/PublicProfile.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `Showcase`:
  ```ts
  /** Розділ «Нагороди»: null, коли немає ні титулу, ні нагород. */
  export function Showcase(props: { showcase: Showcase; own: boolean }): JSX.Element | null;
  ```
  - Картки у сітці (на телефоні — одна колонка):
    - трофей — `TrophyView size="card" interactive spin={false}`;
    - гравіювання;
    - «1 місце · Назва вікторини · дата»;
    - справжній приз — рядок «🎁 текст» (фото — мініатюра);
    - кнопка «Диплом» для `content.diploma`: `renderDiploma` з `award.nickname`, `award.quizTitle`, `new Date(award.awardedAt)`.
  - 3D вантажиться лише для карток, що потрапили у видиму область (`IntersectionObserver`; без нього — одразу). Тоді вітрина з десятком трофеїв не тягне десять сцен одразу.
- Профіль: титул (`showcase.title.text`) — бейдж `.nick-title` біля ніку в шапці `Profile` і `PublicProfile`. Розділ `Showcase` — після «Статистики», перед «Ачівками».
- Тексти: `showcaseTitle` «Нагороди», `showcaseUntil` «титул до {date}», `awardLine` «{place} місце · {quiz} · {date}».

- [ ] **Step 1: Write the failing tests:**
  - `Showcase.test.tsx` (мок `TrophyView` і `diploma`):
    - дві нагороди → два заголовки місць і назви вікторин, найновіша перша (порядок як прийшов);
    - нагорода без трофея → немає `TrophyView`, є «🎁 Піца»;
    - «Диплом» лише в нагороди з `diploma`, клік → `renderDiploma` з `nickname` нагороди;
    - `{ title: null, awards: [] }` → нічого;
    - лише титул → розділ з «титул до …».
  - `PublicProfile.test.tsx`: профіль з `showcase.title` → бейдж біля ніку й розділ «Нагороди».
  - `Profile.test.tsx`: те саме для власного.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile apps/web/src/pages/Profile.test.tsx apps/web/src/pages/PublicProfile.test.tsx` → FAIL.
- [ ] **Step 3: Implement** компонент, вставки, тексти, стилі.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): the showcase — «Нагороди» in public and own profiles with trophies to turn by finger or mouse, engravings, real prizes as records and diplomas, and the current title next to the nickname

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 12. Наскрізний сценарій 14a

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `afterSplash`, `pickOption`, `shot`, `snapshot`, `expectNoSideScroll`, `problems`, `classicRound`, `makeRoundsQuiz`.
- Вікторина «Призова вікторина 14a» — один класичний раунд «Розминка», два запитання `single`, `speedBonus: false`, `shuffleOptions: false`. Правильна — `a`:
  1. «Яке місто називають столицею Галичини?» (Львів, Тернопіль, Івано-Франківськ, Дрогобич);
  2. «Яке море омиває Одесу?» (Чорне, Азовське, Середземне, Балтійське).
- Екрани:
  - пульт 1280 × 800 (`host14a`, акаунт);
  - сцена 1280 × 720 (`stage14a`);
  - Оля (`olya14a`, **акаунт**, 375 × 812), Петро (`petro14a`, гість, 375 × 812).
- На телефонах до будь-якого переходу — `page.addInitScript(() => { delete (navigator as any).canShare; })`, тож «Диплом» гарантовано завантажує файл. Кожна сторінка збирає URL запитів (`page.on('request')`).

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 13b:
  ```ts
  it('part 14a: prizes — the host makes a gold cup with an engraving, a pizza, a title and a diploma and a silver medal in «Мої призи», puts them on places 1 and 2 in the lobby, the stage and the phones show «Граємо за», the finish raises the podium with the winner last, the signed-in Оля gets «Твій приз» and downloads the diploma, the cup moves to her showcase with the title, and the medal of the guest Петро goes back to the store', async () => {
    try {
      await prizes14a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `prizes14a()`:**
  1. **Склад.**
     - Реєстрація ведучого й Олі.
     - Ведучий на телефонному вікні 375 × 812 (окрема сторінка `hostPhone` того самого контексту): `/prizes` → «Новий приз»:
       - назва «Головний приз»;
       - «3D-трофей» — кубок, «Золото»;
       - «Гравіювання» — «Чемпіон призової вікторини 2026»;
       - «Справжній приз» — «Піца 🍕»;
       - «Титул біля ніку» — «👑 Король вікторини»;
       - «Диплом»;
       - «Зберегти».
     - Другий: «Друге місце», медаль «Срібло».
     - `expectNoSideScroll(hostPhone, 'p14a-prizes')`, кадр `p14a-prizes`. Меню з шістьма пунктами без прокрутки вбік.
  2. **Лобі.**
     - Вікторина через `POST /api/quizzes`, «Грати», сцена, `join` Олі (з акаунтом) і Петра.
     - Пульт: «Призи гри» — 1 місце «Головний приз», 2 місце «Друге місце» → «Покласти призи».
     - Сцена: «Граємо за», «Золотий кубок», «Піца 🍕». Кадр `p14a-stage-lobby`.
     - Телефон Олі: «Граємо за: …», `expectNoSideScroll(olya, 'p14a-phone-lobby')`.
     - Жодна сторінка ще не запитувала `.glb` і чанк з `model-viewer` (перевірка списку URL).
  3. **Гра.**
     - «Почати гру» → «Почати раунд» → запитання 1: Оля «Львів», Петро «Тернопіль» → розкриття → «Далі».
     - Запитання 2: обидва «Чорне» → розкриття → «Завершити гру» (`confirm`).
  4. **Церемонія.**
     - Сцена: `.podium` → спершу видно 2-ге місце з «Петро», тоді 1-ше з «Оля», «Чемпіон призової вікторини 2026» і «👑 Король вікторини». Кадр `p14a-stage-ceremony`.
     - Тепер сцена запитала `/models/cup.glb`. Якщо WebGL у безголовому браузері немає, замість цього є `.trophy-fallback`, і тест приймає будь-який з двох варіантів.
     - Телефон Олі: «Твій приз» → «Диплом» → `olya.waitForEvent('download')` з `suggestedFilename()` `dyplom-Оля.png` (нік у грі — «Оля», «Петро»). Кадр `p14a-phone-prize`, `expectNoSideScroll(olya, 'p14a-phone-prize')`.
     - Телефон Петра (гість, 2-ге місце): «Твій приз» і нотатка «Ти граєш як гість: у вітрину приз не потрапить.»; кнопки «Диплом» немає (у медалі диплома немає). Кадр `p14a-phone-guest`.
  5. **Склад і вітрина.**
     - `host.request.get('/api/me/prizes')` → один приз «Друге місце» зі статусом `free`, «Головного призу» немає.
     - Оля → `/profile`: розділ «Нагороди» з «1 місце · Призова вікторина 14a», бейдж «👑 Король вікторини» біля ніку. `expectNoSideScroll(olya, 'p14a-showcase')`, кадр `p14a-showcase`.
     - Петро (гість) → `GET /api/profiles/<id Олі>` → `showcase.awards.length === 1`, `showcase.title.text === '👑 Король вікторини'`.
  6. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 14a"` → PASS. Переглянути кадри `p14a-*`:
  - меню на 375 px без прокрутки вбік;
  - «Граємо за» на сцені не виштовхує QR за межі 720 px;
  - церемонія не обрізає гравіювання;
  - вітрина — одна колонка.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані:** `npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо 12d (п'єдестал і карусель без призів не змінились), 13b (збереження) і перезапуски 9b. Якщо не вистачає пам'яті, прогнати групами за `-t` і сказати про це у звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 14a end-to-end — prizes made in «Мої призи», placed on places 1 and 2 in the lobby, «Граємо за» on the stage and phones, the podium ceremony with the winner last, the winner's diploma download, the cup in her showcase with the title, and the guest's medal back in the store

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
