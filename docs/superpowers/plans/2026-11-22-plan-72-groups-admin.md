# План 72. Адмінка → Групи: додати учасника й додати запис

Черга 45, пункт 9. Розширює картку групи в адмінці (план 63, `apps/web/src/admin/AdminGroup.tsx`) двома діями: **додати людину до групи** і **додати запис у групу**. Обидві — через журнал дій адміна.

> **Версія стану: `GAME_STATE_VERSION` — БЕЗ змін.** Ігор, рушія й збережених кімнат план не торкається.
>
> **Звірка з кодом.** План спирається на `main` 2026-11-22 (`1205cc19`). Номери рядків — орієнтир; перед кожною задачею виконавець звіряє код. Паралельно будуються плани 67 (широкий макет, `styles.css`) і 69 (адмінка → користувачі), а план 68 теж дописує види в кінець `ADMIN_ACTION_KINDS` — при злитті списків у `admin.ts`/`admin.test.ts` **зберегти обидва набори**, порядок: що злито раніше — те й раніше.

## Коротка специфікація

**Прохання власника (дослівно):** «Дати можливість додавати користувачів в групу, а також додавати записи з адмінки.»

### Що вже є (63)

- Сервер: `apps/server/src/admin-moderation-routes.ts` (маршрути `/api/admin/groups…`), `apps/server/src/moderation-store.ts` (`adminGroup`, `adminRemoveMember`, `adminTransferOwner`, `setItemHidden` тощо; у кожній дії — `logAction` у тій самій транзакції).
- Групи: `apps/server/src/group-store.ts` (приватні `lockPerson`, `peopleIn`, `groupsOf`, `addMember`; межі `GROUP_LIMITS`: 30 людей у групі, 10 груп на людину, прихована адміністратором група місця не займає), `apps/server/src/group-items.ts` (`createItem`, `toView`; автор показується, лише якщо він теперішній учасник — інакше «вже не в групі»).
- Записи групи — `group_item` з видами `GROUP_ITEM_KINDS = ['fact', 'story', 'quote', 'date']`, полями `text`, `about` (до 5: учасник чи ім'я), `answer`, `year`, `photo`, `surprise`. Окремих «постів», вікторин чи фотоальбомів у групі немає: «запис» — це і є пост.
- «Сповіщення» в групах сьогодні — лише запрошення (`group_invite`, значок у меню). Пушів група не шле. Особистий пуш від адміна вже є — `problem_reply` (64): `push.deliver([userId], …)` незалежно від `admin_push`.
- Пошук людей в адмінці — `PeoplePicker` (`apps/web/src/admin/PeoplePicker.tsx`) над `GET /api/admin/bot/people` (бот і заблоковані не знаходяться, нікнейм обов'язковий).

### 1. Додати учасника

- На картці групи, під «Учасники», — розділ **«Додати учасника»**: `PeoplePicker` (`max={1}`), кнопка «Додати до групи» → підтвердження `window.confirm` → `POST /api/admin/groups/:id/members { userId }`.
- Людина **одразу стає учасником** (`role: 'member'`), без її згоди (див. «Рішення власника», п. 1). Її запрошення в цю групу, якщо було, зникає (як у `addMember`).
- Перевірки під замками в порядку group-store — **спершу людина (`lockPerson`), потім група (`FOR UPDATE`)**:
  - групи немає → `404 group_not_found`;
  - людини немає / це бот (`BOT_USER_ID`) → `404 user_not_found`;
  - людина заблокована (`user_ban`) → `409 member_banned`;
  - група прихована адміністратором → `409 group_hidden` (спершу повернути групу);
  - уже в групі → `409 already_member`;
  - у групі вже 30 → `409 group_full`;
  - людина вже в 10 (видимих) групах → `409 member_too_many_groups` (окремий код: наявний `err_too_many_groups` звертається до самої людини «Вийди з якоїсь…»).
- Друзі власника не потрібні: адмін додає будь-кого (запрошення власника — лише друзям).
- Журнал: новий вид **`group_member_add`**, ціль — додана людина, `details: { title: назва групи }`. Рядок: «{admin} додав(-ла) {target} до групи «{title}»».
- **Сповіщення:** новий вид пушу **`group_added`** `{ kind, groupId, title }` → «Тебе додали до групи «{title}»» / «Торкнися, щоб відкрити групу.», посилання `/profile/groups/{groupId}`, `tag: group-{groupId}`. Іде лише цій людині, незалежно від `admin_push` (як `problem_reply`), у фоні (`push.background`). Відповідь маршруту — `200 { changed: true, pushed }` (`pushed` — у людини є підписка й push-служба є), як у `problem_reply`. Без пушів людина побачить групу в «Моїх групах» (вона з'являється там одразу).
- Після успіху — рядок стану «{name} тепер у групі.» (+ «Пуш-сповіщень у людини немає — вона побачить групу в «Моїх групах».», коли `pushed: false`), картка перечитується. Група повна — замість пошуку рядок «Група повна: {max} людей.» (кнопки немає).

### 2. Додати запис

- На картці групи, над списком «Записи», — розділ **«Новий запис»**: вид (`fact`/`story`/`quote`/`date`, підписи — наявні `itemKind_*`), текст (до 1000, лічильник `groupCounter`), «Про кого» — прапорці з теперішніх незаблокованих учасників (до 5), відповідь (необов'язково), рік (необов'язково, `yearOk` з `groups/ItemForm.tsx`). Без фото й без «сюрпризу» (див. «Рішення власника», п. 3). Тіло збирає наявний `itemInput(...)` з `groups/ItemForm.tsx` (`photo: null`, `surprise: false`).
- **Автор — «Квіз-бот»** (`BOT_USER_ID`), а не особистий акаунт адміна (див. «Рішення власника», п. 2). Чому бот:
  - адмін зазвичай не учасник групи, і запис від нього показувався б як «вже не в групі»;
  - особистий нік адміна не світиться в чужих родинних групах, а запис має «службовий» вигляд;
  - автор-бот ніколи не стане учасником і не зможе правити запис у звичайному інтерфейсі — правка лише через адмінку (ховання), видалити його може власник групи (як будь-який чужий запис);
  - бот уже є справжнім рядком `user` з профілем (`ensureBotAccount`), тож `group_item.author_id` FK не ламається.
- `POST /api/admin/groups/:id/items` з тілом `groupItemInputSchema`, звуженим до `surprise: false` і `photo: null` (інакше `400 invalid_payload`); причини з `GROUP_REASONS` (`item_text`, `item_about`) віддаються як `invalid_payload:<reason>`, як у `group-routes`.
  - групи немає → `404 group_not_found`; прихована → `409 group_hidden`; 500 записів → `409 group_items_full`; «про кого» не учасник → `400 invalid_payload:about_not_member` (наявний текст); бота немає (його пошту зайнято) → `409 bot_unavailable` (наявний текст).
  - Ачивка «Літописець» (`chroniclerAfterRecord`) **не** рахується: автор — бот.
- Показ: у `toView` автор `BOT_USER_ID` — завжди картка бота (нік і аватар з його профілю), не «вже не в групі». У картці адміна автор і так береться з `profile` (там «Квіз-бот»).
- Журнал: новий вид **`group_item_add`**, ціль — власник групи (як у `group_hide`; немає власника — `null`), `details: { title: назва групи, text: перші 200 символів }`. Рядок: «{admin} додав(-ла) запис «{text}» у групу «{title}» від Квіз-бота ({target})».
- Учасникам пуш про новий запис **не** шлемо (див. «Рішення власника», п. 4).

### 3. Спільне

- `ADMIN_ACTION_KINDS` — у кінець `'group_member_add', 'group_item_add'`; ті самі — у `ADMIN_LOG_GROUP_KINDS.moderation` (після `group_item_show`); той самий список у `packages/shared/src/admin.test.ts`.
- `packages/shared/src/moderation.ts`: `adminGroupMemberAddSchema = z.object({ userId: z.string().min(1).max(64) }).strict()`, `adminGroupItemSchema` (див. задачу 1), тип `AdminGroupMemberAdded = { changed: true; pushed: boolean }`.
- Пуш `group_added` — `packages/shared/src/push.ts` (`PUSH_KINDS`, `PushPayload`, `pushPayloadSchema`), `apps/server/src/push.ts` (`PUSH_TTL.group_added = 86_400`, `NORMAL_URGENCY`), `apps/web/src/push/sw-handlers.ts` (`KINDS`, `isPushPayload`), `apps/web/src/push/push-text.ts`, рядки — `apps/web/src/push/push-strings.ts` + `apps/web/src/push/strings/{en,pl,de,es,it,ar}.json`.

## Глобальні обмеження

- **Prettier не запускати.** Тести — з `--maxWorkers=2`. Коментарі в коді — українською. `python3` тут заглушка: правити лише Edit/node; після коміту — `git show --stat`.
- Нові ключі i18n — у всіх 7 мовах (uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,pl,de,es,it,ar}.json`) і в новому списку **`ADDED_72`** у `apps/web/src/i18n.test.ts` (і в загальному фільтрі «adds no uk keys beyond the agreed list»). Пушеві рядки — у новому **`ADDED_72_SW`** (за зразком `ADDED_ERRORS_64_SW`). Перекладені значення не дорівнюють uk; змінні `{…}` — ті самі.
- **CSS — локально.** Спершу наявні класи (`panel`, `admin-card-section`, `field`, `field-check`, `btn`, `btn-danger`, `meta`, `error`, `admin-action-line`, `admin-bot-people`, `admin-bot-found`, `item-kind-tabs` не брати — це екран гравця). Якщо нове правило таки потрібне — лише селектори з префіксом `.admin-group-add` / `.admin-group-new-item`, окремим блоком «72» **у кінці** `styles.css`, без ширин і без `@media (max-width: 480px|400px)` (план 67 бере ширини на себе й тести шукають ці блоки).
- Порядок замків як у group-store: **людина → група**. Кожна дія й її рядок журналу — в одній транзакції; пуш — після коміту, у фоні.
- Не чіпати: `addMember`/`acceptInvite`/`joinByCode` за поведінкою (лише винести спільне), `GROUP_LIMITS`, видимість записів (`visibleItemsWhere`).
- E2E — новий `apps/server/e2e/part72-groups-admin.e2e.ts`; 360 px, світла тема, `expectNoSideScroll`.
- Не комітити нічого поза файлами задачі; повідомлення комітів — англійською в стилі репозиторію.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `adminGroupAddTitle` | `Додати учасника` |
| `adminGroupAddLead` | `Людина одразу стане учасником групи й отримає сповіщення. Межі ті самі: {members} людей у групі, {groups} груп на людину.` |
| `adminGroupAddButton` | `Додати до групи` |
| `adminGroupAddConfirm` | `Додати {name} до групи «{group}»?` |
| `adminGroupAdded` | `{name} тепер у групі.` |
| `adminGroupAddedNoPush` | `Пуш-сповіщень у людини немає — вона побачить групу в «Моїх групах».` |
| `adminGroupFull` | `Група повна: {max} людей.` |
| `adminGroupItemAddTitle` | `Новий запис` |
| `adminGroupItemAddLead` | `Запис з'явиться в групі від імені «Квіз-бот»; учасники побачать його одразу.` |
| `adminGroupItemAbout` | `Про кого (до {max})` |
| `adminGroupItemAddButton` | `Додати запис` |
| `adminGroupItemAdded` | `Запис додано.` |
| `adminGroupItemsFull` | `У групі вже {max} записів — нового не додати.` |
| `err_user_not_found` | `Такої людини немає.` |
| `err_member_banned` | `Людину заблоковано — до групи її не додати.` |
| `err_group_hidden` | `Групу приховано — спершу поверни її.` |
| `err_already_member` | `Ця людина вже в групі.` |
| `err_member_too_many_groups` | `Людина вже в 10 групах — це межа.` |
| `adminLog_group_member_add` | `{admin} додав(-ла) {target} до групи «{title}»` |
| `adminLog_group_item_add` | `{admin} додав(-ла) запис «{text}» у групу «{title}» від Квіз-бота ({target})` |

Пушеві (`push-strings.ts`, uk):

| Ключ | uk |
|---|---|
| `pushGroupAddedTitle` | `Тебе додали до групи «{title}»` |
| `pushGroupAddedBody` | `Торкнися, щоб відкрити групу.` |

Перед додаванням — `grep -n "err_user_not_found\|err_already_member\|err_group_hidden" apps/web/src/i18n.ts`: якщо ключ уже є з придатним текстом — не дублювати, а прибрати з таблиці й зі списку `ADDED_72`. «Квіз-бот» у перекладах — як у наявних `pushBotOpenTitle` відповідної мови.

---

### Задача 1. Спільне: види журналу й схеми

**Файли:** `packages/shared/src/admin.ts`, `packages/shared/src/admin.test.ts`, `packages/shared/src/moderation.ts`, `packages/shared/src/moderation.test.ts` (дописати).

**Спершу тести (падають):**
- `admin.test.ts`: у точному списку `ADMIN_ACTION_KINDS` наприкінці `'group_member_add', 'group_item_add'`; наявна перевірка «кожен вид — рівно в одній групі» має їх бачити в `moderation`.
- `moderation.test.ts`:
  - `adminGroupMemberAddSchema` приймає `{ userId: 'u1' }`; відкидає `{}`, `{ userId: '' }`, 65 символів, зайве поле.
  - `adminGroupItemSchema` приймає `{ kind: 'fact', text: ' Бабуся свистить ', about: [], answer: null, year: null, photo: null, surprise: false }` (текст обрізано); відкидає `surprise: true` (з учасником у `about`), `photo: 'https://…'`, `kind: 'post'`, порожній текст (причина `item_text` — перше issue має `message: 'item_text'`).

**Зміни:**
- `admin.ts`: два види в кінець `ADMIN_ACTION_KINDS` і в `ADMIN_LOG_GROUP_KINDS.moderation` після `'group_item_show'`.
- `moderation.ts`:
  ```ts
  /** 72: адмін додає людину до групи напряму. */
  export const adminGroupMemberAddSchema = z.object({ userId: z.string().min(1).max(64) }).strict();
  /** 72: запис від Квіз-бота — та сама форма, що в учасника, але без фото й без сюрпризу. */
  export const adminGroupItemSchema = groupItemInputSchema.refine((item) => !item.surprise && item.photo === null, { message: 'admin_item_plain' });
  export interface AdminGroupMemberAdded { changed: true; pushed: boolean }
  ```
  (імпорт `groupItemInputSchema` з `./groups`; перевірити, що `index.ts` реекспортує `moderation` повністю.)

**Команди:** `pnpm vitest run packages/shared/src/admin.test.ts packages/shared/src/moderation.test.ts --maxWorkers=2`; `pnpm typecheck` (впаде на `Record<AdminActionKind,…>`, якщо такі є — їх закриє задача 6; якщо typecheck ламається вже тут, додати в тій самій задачі заглушки ключів `adminLog_*` у uk і перенести переклади в задачу 6).

**Коміт:** `feat(shared): group_member_add and group_item_add admin kinds, schemas to add a member and a bot record (72)`

---

### Задача 2. Пуш `group_added`

**Файли:** `packages/shared/src/push.ts`, `packages/shared/src/push.test.ts`, `apps/server/src/push.ts`, `apps/web/src/push/sw-handlers.ts`, `apps/web/src/push/sw-handlers.test.ts`, `apps/web/src/push/push-text.ts`, `apps/web/src/push/push-text.test.ts`, `apps/web/src/push/push-strings.ts`, `apps/web/src/push/strings/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`.

**Спершу тести (падають):**
- `push.test.ts`: `pushPayloadSchema` приймає `{ kind: 'group_added', groupId: 'g', title: 'Родина' }`, відкидає без `title`; `PUSH_KINDS` містить `group_added`.
- `sw-handlers.test.ts`: `isPushPayload` — так для правильного `group_added`, ні без `groupId`.
- `push-text.test.ts`: `pushNotice({ kind: 'group_added', groupId: 'g1', title: 'Родина' }, 'Europe/Kyiv')` → `{ title: 'Тебе додали до групи «Родина»', body: 'Торкнися, щоб відкрити групу.', url: '/profile/groups/g1', tag: 'group-g1' }`; для `locale: 'en'` — англійський заголовок.
- `i18n.test.ts`: `ADDED_72_SW = ['pushGroupAddedTitle', 'pushGroupAddedBody']` і `it('72 push keys (added to a group) are in every push dictionary', …)` — копія тесту для `ADDED_ERRORS_64_SW`.

**Зміни:**
- `PushPayload` + `| { kind: 'group_added'; groupId: string; title: string; locale?: Locale }` з коментарем «72: адмін додав людину до групи»; гілка в `pushPayloadSchema`; `'group_added'` у `PUSH_KINDS`.
- `apps/server/src/push.ts`: `PUSH_TTL.group_added = 86_400`, `'group_added'` у `NORMAL_URGENCY`.
- `sw-handlers.ts`: `KINDS` + перевірка `typeof raw.groupId === 'string' && typeof raw.title === 'string'`.
- `push-text.ts`: гілка перед `const title = payload.title` (url через `encodeURIComponent(groupId)`).
- Рядки — у `pushStrings` і 6 JSON.

**Команди:** `pnpm vitest run packages/shared/src/push.test.ts apps/web/src/push apps/web/src/i18n.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(push): group_added notice — you were added to a family group (72)`

---

### Задача 3. Сервер: адмін додає учасника

**Файли:** `apps/server/src/group-store.ts`, `apps/server/src/moderation-store.ts`, `apps/server/src/moderation-store.test.ts`.

**Спершу тести (падають)** — у `describe('moderation store: groups (63)')` новий `describe('moderation store: adding (72)')` з тими самими помічниками файлу:
- `adminAddMember` додає незнайомця (не друга власника) → `{ ok: true, changed: true }`; `roleIn` = `'member'`; його запрошення в цю групу зникло; журнал: рівно один `group_member_add` з `targetUserId` = людина, `details.title` = назва.
- Повтор → `{ ok: false, error: 'already_member' }`, журнал без нового рядка.
- Невідомий id і `BOT_USER_ID` → `user_not_found`; заблокований → `member_banned`; прихована група → `group_hidden`; невідома група (і не-UUID) → `group_not_found`.
- Група з 30 людьми → `group_full`; людина в 10 видимих групах → `member_too_many_groups`; та сама людина, коли одна з її 10 груп прихована, — додається (прихована місця не займає).
- Дві одночасні `adminAddMember` тієї самої людини в дві різні групи, коли їй лишилось одне місце (`Promise.all`) → рівно один успіх (замок людини).

**Зміни:**
- `group-store.ts`: експортувати `lockPerson`, `peopleIn`, `groupsOf` (лише `export`, без зміни поведінки; коментар «72: також для адмінки»).
- `moderation-store.ts`:
  ```ts
  /**
   * 72: адмін додає людину до групи напряму (без запрошення й без дружби з власником). Замки — людина, потім група, як у group-store;
   * межі ті самі (30 людей, 10 видимих груп); прихована група — спершу повернути. Її запрошення в цю групу зникає.
   */
  export async function adminAddMember(
    db: Db,
    input: { adminId: string; groupId: string; userId: string; now: Date },
  ): Promise<{ ok: true; changed: true; groupName: string } | Fail<'group_not_found' | 'user_not_found' | 'member_banned' | 'group_hidden' | 'already_member' | 'group_full' | 'member_too_many_groups'>>
  ```
  Усередині транзакції: `lockPerson(tx, userId)` → `lockedGroup` → `user` існує і `!== BOT_USER_ID` → немає `user_ban` → `hiddenAt === null` → `roleIn === null` → `peopleIn < membersMax` → `groupsOf < groupsPerUser` → `insert groupMember` (`role: 'member'`, `joinedAt: now`) → `delete groupInvite` цієї людини в цій групі → `logAction({ kind: 'group_member_add', targetUserId: userId, details: { title: group.name } })`. `groupName` повертається для пушу. Перевірку UUID групи — до транзакції, як у сусідів.

**Команди:** `pnpm vitest run apps/server/src/moderation-store.test.ts apps/server/src/group-store.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): an admin adds a person to a family group directly, within the group limits, logged (72)`

---

### Задача 4. Сервер: запис від Квіз-бота

**Файли:** `apps/server/src/group-items.ts`, `apps/server/src/group-items.test.ts`, `apps/server/src/moderation-store.ts`, `apps/server/src/moderation-store.test.ts`.

**Спершу тести (падають):**
- `group-items.test.ts`: запис з `authorId = BOT_USER_ID` (вставлений через нову функцію; бот — `ensureBotAccount(db)` у `beforeAll`) у `listItems` для учасника має `author = { id: 'quiz-bot', nickname: 'Квіз-бот', avatar: … }`, `mine: false`; `canDelete` — `true` для власника, `false` для учасника; запис від колишнього учасника лишається з `author: null` (поведінка без змін).
- `moderation-store.test.ts`, `describe('moderation store: adding (72)')`:
  - `adminAddItem` у звичайну групу → `{ ok: true }`; рядок `group_item` з `authorId = BOT_USER_ID`, `about` з ніком учасника на цю мить; журнал: один `group_item_add`, `targetUserId` = власник, `details` = `{ title, text: перші 200 символів }` (перевірити текст на 250 символів).
  - `about` з не-учасником → `about_not_member`; прихована група → `group_hidden`; невідома → `group_not_found`; 500 записів → `group_items_full`; без рядка бота (видалити `user` бота в окремій БД-фікстурі чи перевірити через `user` існування) → `bot_unavailable`. У кожній відмові журнал без нового рядка.

**Зміни:**
- `group-items.ts`:
  - Винести тіло `createItem` у внутрішню `insertItem(db, groupId, authorId, input, now, check: (tx) => Promise<'ok' | 'group_not_found' | 'group_hidden'>, log?: (tx, row) => Promise<void>)`: та сама послідовність (картки до транзакції, `about` через `storedAbout`, межа 500), але перевірка автора й журнал — параметрами. `createItem` викликає її з `lockMember` (поведінка й тести без змін).
  - Нова експортована `createBotItem(db, { groupId, input, now, log })` — перевірка: група під `FOR UPDATE` є (`group_not_found`), `hiddenAt === null` (`group_hidden`); автор `BOT_USER_ID`; `log(tx, row)` — колбек журналу, щоб `group-items` не залежав від `bans.ts`/адмінки.
  - `toView`: `author` = `members.get(authorId)` ?? (`authorId === BOT_USER_ID` ? картка бота : `null`). Картку бота брати з `profile` одним запитом у `listItems`/`createItem`/`updateItem` лише коли серед рядків є автор-бот (помічник `botCard(db)`, `ensureProfile` за потреби). Коментар: «72: запис від адміна — від Квіз-бота; бот не учасник, але не "вже не в групі"».
- `moderation-store.ts`:
  ```ts
  /** 72: запис у групу від Квіз-бота; ціль у журналі — власник групи, у деталях — назва групи й перші 200 символів. */
  export async function adminAddItem(
    db: Db,
    input: { adminId: string; groupId: string; item: GroupItemInput; now: Date },
  ): Promise<{ ok: true; itemId: string } | Fail<'group_not_found' | 'group_hidden' | 'group_items_full' | 'about_not_member' | 'bot_unavailable'>>
  ```
  Спершу: `UUID` групи; рядок `user` з `id = BOT_USER_ID` є — інакше `bot_unavailable`. Далі `createBotItem(..., log: (tx, row) => logAction(tx, { adminId, kind: 'group_item_add', targetUserId: await ownerOf(tx, groupId), details: { title: group.name, text: row.text.slice(0, 200) }, now }))` (назву групи — з того самого заблокованого рядка; за потреби `check` повертає й назву).

**Команди:** `pnpm vitest run apps/server/src/group-items.test.ts apps/server/src/moderation-store.test.ts apps/server/src/group-routes.test.ts apps/server/src/group-uses.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): an admin adds a group record authored by the quiz bot, shown with the bot card, logged (72)`

---

### Задача 5. Маршрути адмінки

**Файли:** `apps/server/src/admin-moderation-routes.ts`, `apps/server/src/admin-moderation-routes.test.ts`.

**Спершу тести (падають)** — за зразком наявних тестів файлу (адмін, не-адмін, гість; заглушка push як у тестах `admin-problem-routes`, з `outbox`):
- `POST /api/admin/groups/:id/members { userId }` → `200 { changed: true, pushed: true }` для людини з підпискою; в `outbox` рівно один пуш `{ kind: 'group_added', groupId, title }` саме їй (після `push.idle()`); без підписки — `pushed: false`, пушів 0; без push-служби (`push: null`) — `pushed: false`, 200.
- Статуси: `already_member` 409, `group_full` 409, `member_too_many_groups` 409, `member_banned` 409, `group_hidden` 409, `user_not_found` 404, невідома група 404 `group_not_found`, не-UUID групи 404 `not_found`; `{}`/зайве поле → 400 `invalid_payload`. Не-адмін і гість → 404 `not_found` і жодних змін.
- `POST /api/admin/groups/:id/items` → `201 { id }`; запис видно учаснику через `GET /api/groups/:id/items` з автором «Квіз-бот»; `surprise: true` чи `photo` → 400 `invalid_payload`; порожній текст → 400 `invalid_payload:item_text`; `about` з чужим id → 400 `invalid_payload:about_not_member`; `group_items_full` 409; `group_hidden` 409; не-адмін → 404.

**Зміни:**
- `FAIL_STATUS` + `user_not_found: 404, member_banned: 409, group_hidden: 409, already_member: 409, group_full: 409, member_too_many_groups: 409, group_items_full: 409, bot_unavailable: 409`; `about_not_member` — окремо як `400 { error: 'invalid_payload:about_not_member' }`.
- Маршрут членства (ворота `write`, `adminOf`, перевірка UUID як у сусідів):
  ```ts
  // 72: людина одразу в групі; пуш — особистий, як відповідь на скаргу (64): незалежно від admin_push, у фоні, після коміту.
  const done = await adminAddMember(db, { adminId: me.id, groupId: id, userId: body.data.userId, now: now() });
  if (!done.ok) return answer(reply, done);
  const pushed = deps.push !== null && (await subscriptionsOf(db, [body.data.userId])).length > 0;
  deps.push?.background(deps.push.deliver([body.data.userId], { kind: 'group_added', groupId: id, title: done.groupName }));
  return { changed: true, pushed } satisfies AdminGroupMemberAdded;
  ```
  (`subscriptionsOf` — з `./push-store`, як в `admin-problem-routes.ts`.)
- Маршрут запису: `adminGroupItemSchema.safeParse`; невдача — причина першого issue з `GROUP_REASONS` → `invalid_payload:<reason>`, інакше `invalid_payload` (помічник `invalidItem` поруч; як `invalid` у `group-routes.ts`); успіх — `201 { id }`.

**Команди:** `pnpm vitest run apps/server/src/admin-moderation-routes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): admin routes to add a group member (with a push) and a bot record (72)`

---

### Задача 6. Ключі i18n у 7 мовах і рядки журналу

**Файли:** `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/admin/admin-text.test.ts`, `apps/web/src/admin/log-csv.test.ts`.

**Спершу тести (падають):**
- `i18n.test.ts`: `const ADDED_72 = [...]` — усі ключі з таблиці (без пушевих); `it('72 keys (adding to groups from the admin) are in every locale', …)` — копія тесту `ADDED_MERGE_66` (uk не порожні, точні uk для `adminLog_group_member_add`, `adminLog_group_item_add`, `err_member_too_many_groups`; у кожній мові є, змінні збігаються, текст ≠ uk); `ADDED_72` — у фільтр «adds no uk keys beyond the agreed list».
- `admin-text.test.ts`: `logLine` для `group_member_add` (`target: 'Петро', details: { title: 'Родина' }`) містить «додав(-ла) Петро до групи «Родина»»; для `group_item_add` — «запис «Бабуся свистить» у групу «Родина» від Квіз-бота (Оля)».
- `log-csv.test.ts`: рядок CSV з `group_item_add` має вид у третій колонці (як для `group_item_hide`).

**Зміни:** ключі з таблиці — в uk поруч із блоком 63 (`adminGroup*`, `err_*`, `adminLog_group_*`) з коментарем `// 72: додати учасника й запис з адмінки`; переклади в 6 JSON (українські лапки «…» — як у сусідніх ключах відповідної мови; ar — як у сусідніх ar-рядках). `logLine` змін не потребує (`adminLog_${kind}` з `title`, `text`, `target`) — перевірити.

**Команди:** `pnpm vitest run apps/web/src/i18n.test.ts apps/web/src/admin/admin-text.test.ts apps/web/src/admin/log-csv.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(i18n): texts to add a group member and a bot record from the admin, in 7 languages (72)`

---

### Задача 7. Веб: розділи «Додати учасника» й «Новий запис» на картці групи

**Файли:** `apps/web/src/admin/admin-api.ts`, `apps/web/src/admin/AdminGroup.tsx`, `apps/web/src/admin/AdminGroup.test.tsx`; за потреби `apps/web/src/admin/AdminGroupAdd.tsx` (нові компоненти, щоб `AdminGroup.tsx` не розростався) і блок «72» у кінці `apps/web/src/styles.css`.

**Спершу тести (падають)** — `AdminGroup.test.tsx`, новий `describe('AdminGroup: adding (72)')` з тим самим моком `fetch`:
- Розділ «Додати учасника»: набір «Пе» → (таймер пошуку) кнопка «Петро» → вибрано; «Додати до групи» → confirm «Додати Петро до групи «Родина»?» → `POST /api/admin/groups/g1/members { userId: 'u2' }`; відповідь `{ changed: true, pushed: false }` → рядок стану «Петро тепер у групі. Пуш-сповіщень у людини немає — …», картка перечитана (другий `GET`), вибір очищено.
- Відмова в confirm — запиту немає. `409 already_member` → «Ця людина вже в групі.» у `role="alert"` і перечитування. Кнопка неактивна без вибору й під час запиту.
- Група з `members: 30` → «Група повна: 30 людей.», поля пошуку немає.
- «Новий запис»: вид «Цитата» (radio), текст, прапорець «Про кого» для незаблокованого учасника (заблокованого в списку немає), рік «1998» → «Додати запис» → `POST /api/admin/groups/g1/items` з тілом `{ kind: 'quote', text, about: [{ kind: 'member', userId }], answer: null, year: 1998, photo: null, surprise: false }`; після 201 — «Запис додано.», форма порожня, перечитано. Більше 5 прапорців не поставити (решта `disabled`). Неправильний рік — кнопка неактивна (`yearOk`). `400 invalid_payload:item_text` → наявний текст помилки. 500 записів (`group.items >= 500`) → «У групі вже 500 записів — нового не додати.», форми немає.
- Прихована група: обидва розділи замість форм кажуть `err_group_hidden` («Групу приховано — спершу поверни її.»).

**Зміни:**
- `admin-api.ts`: `addGroupMember(groupId, userId): Promise<ApiData<AdminGroupMemberAdded>>` (POST `/api/admin/groups/:id/members`), `addGroupItem(groupId, item: GroupItemInput): Promise<ApiData<{ id: string }>>` (POST `/api/admin/groups/:id/items`).
- `AdminGroup.tsx`: між «Учасники» і «Записи» — `<AddMemberSection>`; на початку розділу «Записи» (над списком) — `<AddItemSection>`. Обидва отримують `group`, `members`, `busy`, `act` (наявний механізм підтвердження/помилок/`STALE_ERRORS`; додати в `STALE_ERRORS` `already_member`, `group_full`, `member_too_many_groups`, `group_items_full`, `group_hidden`) і `reload`. Рядок стану успіху — `<p className="meta admin-action-line" role="status">`.
- `AddMemberSection`: `PeoplePicker id="admin-group-add" max={1}`; вибір — стан компонента; після успіху — очистити.
- `AddItemSection`: власна компактна форма (не `ItemForm` — та тягне фото, сюрприз і групу гравця): `fieldset` з radio видів (`itemKind_*`, легенда `itemKindsLabel`), `textarea` (`itemTextLabel`, `maxLength` `GROUP_LIMITS.textMax`, лічильник `groupCounter`), `fieldset` «Про кого» з `label.field.field-check` по учаснику (`!banned`, до `GROUP_LIMITS.aboutMax`), `answer` (`itemAnswerLabel`), `year` (`itemYearLabel`, `inputMode="numeric"`). Тіло — `itemInput({ ..., photo: null, surprise: false })` з `groups/ItemForm.tsx`.
- Класи — наявні (`panel admin-card-section`, `field`, `field-check`, `btn`); нові — лише якщо без них розлазиться верстка, з префіксом `.admin-group-add`/`.admin-group-new-item`, блок «72» у кінці `styles.css`.

**Команди:** `pnpm vitest run apps/web/src/admin/AdminGroup.test.tsx apps/web/src/admin/AdminGroups.test.tsx --maxWorkers=2`; `pnpm typecheck`; `pnpm lint` (якщо є в корені).

**Коміт:** `feat(admin): add a member and a quiz-bot record from the group card (72)`

---

### Задача 8. E2E: частина 72

**Файли:** `apps/server/e2e/part72-groups-admin.e2e.ts` (новий).

**Сценарій** (каркас — `part63-moderation-log.e2e.ts`: перезапуск сервера з `adminEmails`; заглушка push з `outbox` — як у `part64-errors-backups.e2e.ts`; `ensureBotAccount(db)`, якщо сервер e2e його ще не створив; у `finally` — `ctx.shutdown()` і `relisten()` під `flags.restarting`):
1. Люди: «Адмін 72» (адмін), «Оля» (власниця групи «Карпатські вечори»), «Петро» (не друг Олі; підписка на пуш `endpointOf('petro')`), «Тарас» (заблокований через `POST /api/admin/users/:id/ban` від адміна). Група — `createGroup(db, olyaId, …)`.
2. Адмін: `/admin/groups` → картка групи → «Додати учасника»: «Пе» → «Петро» → «Додати до групи» (`page.once('dialog', d => d.accept())`) → рядок «Петро тепер у групі.»; кадр `72-admin-group-add` (`view`: без бічного скролу на 360 px).
3. Після `ctx.push!.idle()` в `outbox` рівно один пуш на `endpointOf('petro')` з `{ kind: 'group_added', groupId, title: 'Карпатські вечори' }`.
4. Петро: `/profile/groups` — картка «Карпатські вечори» є; відкрити групу — він у списку учасників.
5. Тарас у пошуку не знаходиться (пошук бота виключає заблокованих); API-перевірка: `POST …/members { userId: tarasId }` від адміна → 409 `member_banned`; повтор для Петра → 409 `already_member`.
6. Адмін: «Новий запис» — вид «Факт», текст «Дідусь Іван щоліта ходив на Говерлу», про кого — Оля, рік 1975 → «Додати запис» → «Запис додано.»; запис у списку адмінки з «✍️ Квіз-бот»; кадр `72-admin-group-item`.
7. Петро (учасник): у групі запис з автором «Квіз-бот» (не «вже не в групі»); Оля як власниця бачить кнопку видалення під ним.
8. Журнал `/admin/log?groups=moderation`: рівно один рядок «додав(-ла) Петро до групи «Карпатські вечори»» і один «додав(-ла) запис «Дідусь Іван щоліта ходив на Говерлу» у групу «Карпатські вечори» від Квіз-бота (Оля)».
9. Не-адмін (Петро) і гість: `POST /api/admin/groups/:id/members` і `/items` → 404; у БД нових рядків немає.
10. Світла тема перевірена (`isLight`), один кадр у темній — як у 63.

**Команди:** `pnpm build && pnpm vitest run --config apps/server/e2e/vitest.config.ts part72 --maxWorkers=2` (кореневий скрипт `e2e` = `pnpm build && vitest run --config apps/server/e2e/vitest.config.ts`; кадри — `E2E_SHOTS=1`).

**Коміт:** `test(e2e): part 72 — the admin adds a person (push) and a quiz-bot record to a family group`

---

### Задача 9. Фінальна перевірка

- `pnpm typecheck`; `pnpm vitest run --maxWorkers=2` (усі юніт-тести); e2e `part63`, `part12k`, `part12l`, `part64`, `part72`.
- `git grep -n "group_member_add\|group_item_add"` — є в `admin.ts`, `admin.test.ts`, `moderation-store.ts`, i18n (7 файлів), тестах журналу.
- Перевірити, що `GAME_STATE_VERSION` не змінено (`git diff main -- packages/shared/src | grep GAME_STATE_VERSION` порожній).
- Перевірити блок «72» у `styles.css` (якщо є): лише префікси `.admin-group-add`/`.admin-group-new-item`, жодних `@media (max-width: 480px|400px)`.

---

## Рішення власника

1. **Додавати одразу чи запрошувати?** План: адмін додає людину **одразу** (вона не погоджується) і людина отримує пуш. Альтернатива — адмін надсилає **запрошення** (`group_invite` з `invitedBy: null` — у списку запрошень уже показується без «від кого»), людина сама приймає; тоді пуш не потрібен — працює наявний значок запрошень у меню. Яке з двох?
2. **Від чийого імені запис?** План: від **«Квіз-бота»** (адмін не учасник групи, його особистий нік не світиться в чужих родинах). Альтернатива — від особистого акаунта адміна (тоді він показуватиметься як «вже не в групі», якщо адмін не учасник, або треба додати окрему позначку «від адміністрації»).
3. **Фото й «сюрприз» у записі від адміна.** План: без них (дешевше; фото потребує завантаження з адмінки). Потрібні?
4. **Повідомляти учасників про новий запис?** План: ні (пушу про записи в групах немає й у звичайних учасників). Потрібно?
5. **Повідомляти власника групи, що адмін додав людину?** План: ні (лише сама людина отримує пуш; власник побачить її в списку). Потрібно?
6. **Ніхто не може вийти з-під цього?** Людина, яку додали, може вийти сама (як зараз), а власник — вилучити. Адмін може додати будь-кого, без дружби з власником. Так і лишаємо?
