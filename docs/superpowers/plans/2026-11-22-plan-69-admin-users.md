# План 69. Адмінка → Користувачі: компактний список і картка з розділами, що розгортаються

Черга 45, пункт 5. Лише структура й поведінка; ширину сторінки на великих екранах робить план 67 — тут не фіксуємо ширин і не боремося з широким макетом, користуємось наявними класами (`panel`, `admin-card-section`, `admin-card-lines`, `field`, `field-check`, `btn`, `btn-danger`, `meta`, `sr-only`).

## Коротка специфікація

**Прохання власника (дослівно):** «Адмінка -> Користувачі. зробити лист більш читабильним в самому листі користувачів без детальної інформації, лише нік, дата реєстраці та емейл і все в один рядок. а вже коли провалюєшся, показується статистика і інформація користувача більш детальна. Також коли провалюєшся в користувача виходить теж довлі громітко, до деяких пунктів приходиться скролити довго. Зробити кожен пункт розвертуваним а також спробувати мінімузіувати місце, але що б це все не було на кучі. наприклад для досягнень, зробити це меню розгортуваним, забрати кнопку відібрати біля кожного досягнення, але дати можливість вибрати потрібні досягнення і відібрати всі разом. і так і в інших пунктах зробити це мінімалістичним.»

### 1. Список `/admin/users` (`AdminUsers.tsx`)

- Кожна людина — **один рядок**: нік (посилання на картку), дата реєстрації (`formatDate(createdAt)`, без «З нами з»), email. Лічильники ігор і вікторин зі списку **зникають** (вони є в «Огляді» картки).
- Розмітка: `<ul className="admin-user-rows">` → `<li className="admin-user-row">` з трьома клітинками: `<Link className="admin-user-nick">`, `<time className="admin-user-date" dateTime={createdAt}>`, `<span className="admin-user-email" dir="ltr">`. Увесь рядок клікабельний: у посилання `::after` з `position: absolute; inset: 0` (рядок — `position: relative`), фокус — `:focus-visible` на рядку через `:has(a:focus-visible)`.
- Сітка рядка: `grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1.6fr)`; вузький екран (`max-width: 30rem`): перший рядок — нік і дата, другий — email на всю ширину (`grid-column: 1 / -1`), без бічного скролу на 360 px. Висота рядка ≥ 2.75rem (ціль дотику).
- Позначки стану **лишаються маленькими бейджами в клітинці ніку**, рядок від них не росте: «Адмін» (`adminIsAdmin`) і «Заблоковано» (новий короткий `adminBannedShort`, без дати; клас `admin-mark is-banned`). Див. «Рішення власника», п. 1.
- Пошук, пагінація, порожньо/помилка — як зараз.

### 2. Картка `/admin/users/:id` (`AdminUser.tsx` + `card/*`)

- Шапка замість `UserCard`: `CardHead` — нік (`h2`), email, позначки «Адмін» / «Заблоковано {date}» (`adminBanned`, клас `admin-mark is-banned` лишається — на нього чекає e2e 21a). «З нами з…», ігор і вікторин у шапці немає (є в «Огляді»).
- **Кожен розділ розгортається**: нова обгортка `CardFold` — `<section className="panel admin-card-section …"><details className="admin-fold" open={open}><summary><h2 className="admin-fold-title">Назва</h2> <span className="admin-fold-count">N</span> <span className="meta">підказка</span></summary><div className="admin-fold-body">…</div></details></section>`. Нативні `<details>/<summary>` (доступні з клавіатури, як у `AdminQuiz` 57). `h2` у summary — заголовок для навігації, ім'я заголовка не містить лічильника (тести шукають розділ за `heading` «Досягнення» тощо).
- `open` — лише **початковий** стан (неконтрольований `details`, як в `AdminQuiz`): перечитування картки після дії (`keep: true`) не перемонтовує розділи, тож відкрите лишається відкритим. Перехід на іншого користувача (66: на головного після об'єднання) — розділи з початку (ключ `detail.user.id` на `UserView`).
- Розділи, порядок і початковий стан:

| Розділ | Лічильник у summary | Відкритий спершу |
|---|---|---|
| Огляд (`adminCardOverview`) | — | так |
| Досягнення | `achievements.length` (+ підказка «забрано: N», якщо `blocked.length > 0`) | ні |
| Досвід | `xp.length` (ручних змін) | ні |
| Останні ігри | `games.length` | ні |
| Вікторини | `quizzes.length` | ні |
| Бани | `bans.length` | ні |
| Модерація (новий заголовок `adminCardModeration`) | — ; підказка «заблоковано», якщо бан | ні |
| Призи | `stock.length + awards.length` | ні |
| Об'єднання (`adminMerge`) | — | ні |
| Видалити акаунт (`adminCardDelete`, лише не-адмін) | — | ні |

- Порожній розділ теж розгортається й каже «…ще немає» (як зараз); лічильник «0» видно в summary — розгортати не треба.
- **Масові дії замість кнопки біля кожного рядка** — спільний компонент `PickList` (`card/PickList.tsx`): `fieldset` з легендою (`sr-only`), прапорець «Вибрати всі» (з `indeterminate`), по прапорцю на рядок (`label.field.field-check`, ім'я прапорця — назва предмета, дата/примітка — `meta` поруч), під списком одна кнопка дії (неактивна, поки нічого не вибрано чи `busy`). Вибір — `Set` id; після перечитування вибір перетинається з наявними id (зниклі випадають).
  - **Досягнення**: «Відібрати вибрані» (`btn btn-danger`) → **одне** підтвердження з переліком назв → **один** запит `POST /api/admin/users/:id/achievements/revoke` `{ achievementIds }`. Сервер забирає по одному тією самою `revokeAchievement` (кожне — своя транзакція, свій запис `achievement_revoke` у журналі, свій `announce`), відповідь `200 { revoked, notOwned }`. Частково вже забрані (друга вкладка) — рядок стану «Відібрано N з M; решту вже забрали — картку оновлено». Усі вже забрані — `404 achievement_not_owned` (наявний шлях «застаріла картка»). Видача досягнення (вибір + «Видати досягнення») і рядки «— Забрано адміністратором» лишаються як є.
  - **Призи → Склад**: «Видалити вибрані» → одне підтвердження → послідовно `DELETE /api/admin/prizes/:id` (кожен — свій запис `prize_delete`).
  - **Призи → Вітрина**: «Прибрати вибрані» → одне підтвердження → послідовно: подарунок адміна — `DELETE /api/admin/gifts/:id`, нагорода з гри — `DELETE /api/admin/awards/:id` (кожен — свій запис у журналі). Рядок вітрини показує: назву (подарунок) або «quizTitle» + місце (нагорода) і `meta` з датою/приміткою, як зараз, але компактно в один-два рядки.
  - Послідовні запити — помічник `runEach` (`card/bulk.ts`): іде по черзі; `not_found` / `gift_not_found` предмета — пропуск (уже немає), інша помилка — зупинка й ця помилка; повертає `ApiResult<{ done: number; skipped: number }>`. Для масової дії `not_found` предмета **не** веде на головну (на відміну від одиничної дії, де `not_found` — «людини немає»).
- Інші розділи вже без кнопок біля рядків (ігри, вікторини, бани, досвід — посилання/текст); їм вистачає згортання. Форми (досвід, подарунок, бан, об'єднання, видалення) — всередині своїх розділів без змін логіки.
- Email, як і досі, — лише в адмінці.

### 3. Сервер

- Нова схема в `packages/shared/src/player-card.ts`: `adminRevokeManySchema = z.object({ achievementIds: z.array(z.enum(ACHIEVEMENTS)).min(1).max(ACHIEVEMENTS.length).refine(унікальні) }).strict()`; тип `AdminRevokeManyResult = { revoked: AchievementId[]; notOwned: AchievementId[] }`.
- Маршрут `POST /api/admin/users/:id/achievements/revoke` у `apps/server/src/admin-card-routes.ts` (ворота `write`, як решта; не-адміну — 404).
- Список `/api/admin/users` не змінюється (поля `games`/`quizzes` лишаються в `AdminUserRow`: їх читає `CardMerge`).

### Обмеження для виконавців

- Prettier не запускати. Тести — з `--maxWorkers=2`. Коментарі в коді — українською. `python3` тут заглушка: правити лише Edit/node.
- Нові ключі i18n — у всіх 7 мовах (uk `apps/web/src/i18n.ts`, решта `apps/web/src/locales/{en,pl,de,es,it,ar}.json`) і в новому списку `ADDED_USERS_69` у `apps/web/src/i18n.test.ts`. Старі ключі (`adminCardRevoke`, `adminCardRevokeConfirm`, `adminDeletePrize`, `adminDeleteAward`, `adminCardGiftRevoke`, `adminCardGiftRevokeConfirm`, `adminJoined`, `adminGamesCount`, `adminQuizzesCount` тощо) **не видаляти** — на них спираються списки ADDED/golden і інші місця; невикористаний ключ тести не ламає.
- Жодних змін `GAME_STATE_VERSION`.

### Нові ключі i18n (uk)

| Ключ | uk |
|---|---|
| `adminBannedShort` | `Заблоковано` |
| `adminCardModeration` | `Модерація` |
| `adminCardBlockedCount` | `забрано: {count}` |
| `adminPickAll` | `Вибрати всі` |
| `adminPickLegend` | `Вибір: {title}` |
| `adminCardRevokePicked` | `Відібрати вибрані` |
| `adminCardRevokePickedConfirm` | `Забрати в {nickname} досягнення ({count}): {names}? Досвід за них теж зникне.` |
| `adminCardRevokePartial` | `Відібрано {done} з {count}; решту вже забрали — картку оновлено.` |
| `adminCardDeletePicked` | `Видалити вибрані` |
| `adminCardDeletePickedConfirm` | `Видалити зі складу {nickname} призи ({count}): {names}? Скасувати не можна.` |
| `adminCardRemovePicked` | `Прибрати вибрані` |
| `adminCardRemovePickedConfirm` | `Прибрати з вітрини {nickname} ({count}): {names}? Скасувати не можна.` |
| `adminCardPickedPartial` | `Зроблено {done} з {count}; решти вже не було — картку оновлено.` |

Лічильник `{count}` у дужках — без форм множини (у всіх мовах число в дужках після іменника у множині).

---

### Задача 1. Спільна схема масового відбирання досягнень

**Файли:** `packages/shared/src/player-card.ts`, `packages/shared/src/player-card.test.ts` (експорт через наявний `packages/shared/src/index.ts`, якщо `player-card` реекспортується повністю — перевірити).

**Зміни:**
- Додати поруч з `adminGrantSchema`:
  ```ts
  /** 69: «Відібрати вибрані» — від одного до всіх досягнень, без повторів. */
  export const adminRevokeManySchema = z
    .object({ achievementIds: z.array(z.enum(ACHIEVEMENTS)).min(1).max(ACHIEVEMENTS.length).refine((ids) => new Set(ids).size === ids.length) })
    .strict();
  export interface AdminRevokeManyResult { revoked: AchievementId[]; notOwned: AchievementId[] }
  ```

**Тести (`player-card.test.ts`):** приймає `['first_game','first_win']`; відкидає `[]`, невідомий id, повтор, зайве поле.

**Перевірка:** `pnpm vitest run packages/shared/src/player-card.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(shared): adminRevokeManySchema — revoke several achievements at once (69)`

---

### Задача 2. Маршрут `POST /api/admin/users/:id/achievements/revoke`

**Файли:** `apps/server/src/admin-card-routes.ts`, `apps/server/src/admin-card-routes.test.ts`.

**Зміни:** у `registerPlayerCardRoutes` поруч з одиничним DELETE:
```ts
// 69: «Відібрати вибрані» — по одному тією самою revokeAchievement: кожне — своя транзакція, свій запис у журналі й announce.
app.post<UserParams>('/api/admin/users/:id/achievements/revoke', write, async (request, reply) => {
  const me = await adminOf(request);
  if (me === null) return reply.code(404).send(NOT_FOUND);
  const { id } = request.params;
  if (unknownUser(id)) return reply.code(404).send(NOT_FOUND);
  const body = adminRevokeManySchema.safeParse(request.body ?? {});
  if (!body.success) return reply.code(400).send(INVALID);
  const revoked: AchievementId[] = [];
  const notOwned: AchievementId[] = [];
  for (const achievementId of body.data.achievementIds) {
    const result = await revokeAchievement(db, { adminId: me.id, userId: id, achievementId, now: now() });
    if (result === 'not_found') return reply.code(404).send(NOT_FOUND); // людини немає — далі не йдемо
    (result === 'revoked' ? revoked : notOwned).push(achievementId);
  }
  // Усе вже забрали (друга вкладка) — та сама помилка, що в одиничного: картка перечитується.
  if (revoked.length === 0) return reply.code(404).send({ error: 'achievement_not_owned' });
  return reply.code(200).send({ revoked, notOwned } satisfies AdminRevokeManyResult);
});
```
Статичний шлях `/achievements/revoke` (POST) не перетинається з `POST /achievements` і `DELETE /achievements/:achievementId`.

**Тести (`admin-card-routes.test.ts`, новий `it` у `describe('the card routes')`):**
- Видати `first_game` і `first_win`; `POST …/achievements/revoke { achievementIds: ['first_game','first_win'] }` → 200 `{ revoked: [обидва], notOwned: [] }`; журнал +2 записи `achievement_revoke`; `card.blocked` містить обидва; `card.achievements` — без них.
- Видати `first_game`; запит `['first_game','first_win']` (друге вже забране) → 200 `{ revoked: ['first_game'], notOwned: ['first_win'] }`, журнал +1.
- Повтор `['first_game']` → 404 `{ error: 'achievement_not_owned' }`.
- `nobody` → 404 `not_found`; `[]`, `['nope']`, повтор id, зайве поле → 400; не-адмін (`other.cookie`) → 404; бот (`BOT_USER_ID`) → 404.

**Перевірка:** `pnpm vitest run apps/server/src/admin-card-routes.test.ts --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(server): revoke several achievements in one request, each logged (69)`

---

### Задача 3. Ключі i18n у всіх 7 мовах

**Файли:** `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/i18n.test.ts`.

**Зміни:**
- Додати 13 ключів з таблиці спеки в `i18n.ts` (поруч з блоком `adminCard*`, ~рядок 5100) і переклади в шість JSON (змінні `{nickname}`, `{count}`, `{names}`, `{done}`, `{title}` — ті самі; перекладений текст відрізняється від uk).
- У `i18n.test.ts`: `const ADDED_USERS_69 = [...13 ключів]`; додати `!ADDED_USERS_69.includes(key)` до фільтра тесту «adds no uk keys beyond the agreed list»; новий `it('69 admin users keys are in every dictionary with the same variables', …)` за зразком блоку `ADDED_MERGE_66` (непорожні, ті самі змінні, не дорівнює uk) + `expect(uk.adminCardRevokePicked).toBe('Відібрати вибрані')`.

**Перевірка:** `pnpm vitest run apps/web/src/i18n.test.ts apps/web/src/locales --maxWorkers=2`.

**Коміт:** `feat(web): i18n keys for the compact admin users list and bulk card actions in 7 languages (69)`

---

### Задача 4. Список користувачів — один рядок; шапка картки

**Файли:** `apps/web/src/admin/AdminUsers.tsx`, `apps/web/src/admin/AdminUser.tsx`, `apps/web/src/admin/AdminUsers.test.tsx`, `apps/web/src/styles.css`.

**Зміни:**
- `AdminUsers.tsx`: `UserCard` замінити на `UserRow({ row })`:
  ```tsx
  /** 69: рядок списку — нік (посилання, весь рядок клікабельний), дата реєстрації, email; бейджі «Адмін» / «Заблоковано» не додають рядка. */
  <li className="admin-user-row">
    <span className="admin-user-nick">
      <Link to={`/admin/users/${encodeURIComponent(row.id)}`}>{nickText(row.nickname)}</Link>
      {row.admin && <span className="admin-mark">{t('adminIsAdmin')}</span>}
      {row.banned !== null && <span className="admin-mark is-banned">{t('adminBannedShort')}</span>}
    </span>
    <time className="admin-user-date meta" dateTime={row.createdAt}>{formatDate(row.createdAt)}</time>
    <span className="admin-user-email meta" dir="ltr">{row.email}</span>
  </li>
  ```
  Список — `<ul className="admin-user-rows">`.
- `AdminUser.tsx`: замість `<ul className="admin-list"><UserCard …/></ul>` — `CardHead` (у цьому ж файлі): `<header className="admin-user-head"><h2>{nickText(nickname)}</h2><p className="meta" dir="ltr">{email}</p>{admin && <p className="admin-mark">…}{banned && <p className="admin-mark is-banned">{t('adminBanned', { date })}</p>}</header>`. Імпорт `UserCard` прибрати.
- CSS (новий блок з коментарем «69: …» після блоку `.admin-list`/`.admin-card`): `.admin-user-rows` (grid, gap 0, без маркерів, рамка-розділювач між рядками `border-block-end: 1px solid var(--line)`), `.admin-user-row` (`position: relative; display: grid; grid-template-columns: minmax(0,1.2fr) auto minmax(0,1.6fr); gap: 0.25rem 0.75rem; align-items: center; min-height: 2.75rem; padding: 0.4rem 0.6rem; overflow-wrap: anywhere`), `.admin-user-row a::after { content: ''; position: absolute; inset: 0 }`, `.admin-user-row:hover`, `.admin-user-row:has(a:focus-visible) { outline: … }` (змінні теми), `.admin-user-nick .admin-mark` — дрібний бейдж (`font-size: 0.8rem; margin-inline-start: 0.4rem`), `@media (max-width: 30rem) { .admin-user-row { grid-template-columns: minmax(0,1fr) auto } .admin-user-email { grid-column: 1 / -1 } }`. Лише змінні теми (світла/темна). Без фіксованих ширин сторінки (план 67).

**Тести (`AdminUsers.test.tsx`):**
- Переписати «shows cards with marks and searches» → «one row per person: nickname link, date, email; marks stay small»: на рядок (`container.querySelectorAll('li.admin-user-row')` = 3) є посилання «Оля» → `/admin/users/u2`, email, `time[datetime="2026-10-01T10:00:00.000Z"]`; `queryByText('Ігор: 3')` — null; «Заблоковано» і «Адмін» — є; пошук — як був.
- `describe('AdminUser')`: «has no ban button for an admin» — чекає «Адмін» у шапці (працює), решта тестів бану — після задачі 5 відкривати розділ «Модерація» (див. там).

**Перевірка:** `pnpm vitest run apps/web/src/admin/AdminUsers.test.tsx --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): admin users list is one line per person — nickname, signup date, email; the card has a compact head (69)`

---

### Задача 5. `CardFold` — кожен розділ картки розгортається

**Файли:** новий `apps/web/src/admin/card/CardFold.tsx`; `apps/web/src/admin/AdminUser.tsx`; `apps/web/src/admin/card/{CardOverview,CardAchievements,CardXp,CardGames,CardModeration,CardPrizes,CardMerge,CardDelete}.tsx`; `apps/web/src/styles.css`; `apps/web/src/admin/AdminUser.test.tsx`, `apps/web/src/admin/AdminUsers.test.tsx`, `apps/web/src/admin/card/CardMerge.test.tsx`.

**Зміни:**
- `CardFold.tsx`:
  ```tsx
  /**
   * 69: розділ картки гравця, що згортається (нативні details/summary): заголовок h2 і лічильник у summary.
   * `open` — лише початковий стан: перечитування картки після дії розділ не перемонтовує, і відкрите лишається відкритим.
   */
  export function CardFold({ title, count, hint, open = false, className, children }: { title: string; count?: number; hint?: string | null; open?: boolean; className?: string; children: ReactNode }): JSX.Element
  ```
  Розмітка — як у спеці; лічильник — `num(count)`; `hint` — `<span className="meta">`.
- Кожен `Card*` замість `<section className="panel admin-card-section"><h2>…</h2>…</section>` — `<CardFold title=… count=… hint=…>…</CardFold>`; початковий стан і лічильники — за таблицею спеки (`CardOverview` — `open`). `CardGames` — три `CardFold`. `CardModeration` — `title={t('adminCardModeration')}`, `hint` — `t('adminBannedShort')` при бані. `CardDelete` — `className="admin-card-delete"` (e2e шукає `section.admin-card-delete`). `CardAchievements` — `hint` = `t('adminCardBlockedCount', { count })`, коли `blocked.length > 0`.
- `AdminUser.tsx`: `<UserView key={state.data.user.id} …/>` — новий користувач (після об'єднання 66) починає з початкових станів розділів. `CardMerge` уже має `key` — лишити.
- CSS (блок «69: розділи картки, що згортаються» біля `.admin-card-section`): `details.admin-fold > summary` (`display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem; min-height: 2.75rem; cursor: pointer; list-style: none`, власний маркер-трикутник через `::before` з поворотом у `[open]`, `::-webkit-details-marker { display: none }` — як `.io-export`), `.admin-fold-title { display: inline; margin: 0; font-size: 1.15rem }`, `.admin-fold-count` (бейдж: `min-width: 1.6rem; padding: 0 0.4rem; border-radius: 999px; background: var(--surface-2 або наявна змінна); font-weight: 700; text-align: center`), `.admin-fold-body { display: grid; gap: 0.75rem; margin-block-start: 0.5rem; min-width: 0 }`. Порожні рядки тривоги/стану всередині тіла: `.admin-fold-body > .admin-card-line:empty { margin-block-start: -0.75rem }` (gap панелі всередині `<details>` не діє — коментар як у `.resume-panel`). Панель згорнутого розділу — менший відступ (`.admin-card-section:has(> details:not([open]))` — `padding-block` зменшений), щоб закрита картка займала мало місця. Лише змінні теми.

**Тести:**
- `AdminUser.test.tsx`: помічник `section(name)` лишається (`closest('section')`); додати `const opened = async (name) => { const box = await section(name); const d = box.querySelector('details')!; if (!d.open) fireEvent.click(d.querySelector('summary')!); /* jsdom може не перемикати — підстрахуватися */ d.open = true; return box; }` і вживати в тестах дій (досягнення, досвід, модерація, призи, видалення). Новий тест «every section folds; only the overview starts open; counts in summaries»: `details` в «Огляд» — `open`, решта — ні; у summary «Досягнення» лічильник = кількість, «Останні ігри» = `games.length`; підказка «забрано: 1», коли є `blocked`; розділ «Модерація» має заголовок; стан відкриття переживає перечитування після дії (відкрити «Досвід», зробити зміну → після reread `details.open === true`).
- `AdminUsers.test.tsx` (describe AdminUser — бан/розбан): поле «Причина…» знаходиться і в закритому `details` (jsdom не ховає), але для ясності відкривати «Модерація».
- `CardMerge.test.tsx`: якщо розділ шукають за заголовком — без змін; додати відкриття розділу перед діями, якщо тест падає.

**Перевірка:** `pnpm vitest run apps/web/src/admin --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): every player card section folds — overview open, the rest closed with counts in the summary (69)`

---

### Задача 6. `PickList` і «Відібрати вибрані» для досягнень

**Файли:** новий `apps/web/src/admin/card/PickList.tsx`; новий `apps/web/src/admin/card/bulk.ts` (+ `bulk.test.ts`); `apps/web/src/admin/admin-api.ts`; `apps/web/src/admin/card/CardAchievements.tsx`; `apps/web/src/admin/AdminUser.test.tsx`; `apps/web/src/styles.css`.

**Зміни:**
- `admin-api.ts`: `export const revokeAchievements = (userId: string, achievementIds: AchievementId[]): Promise<ApiResult<AdminRevokeManyResult>> => request<AdminRevokeManyResult>(\`/api/admin/users/${id(userId)}/achievements/revoke\`, { method: 'POST', body: { achievementIds } });` Одиничний `revokeAchievement` лишається (його вживає хіба що старий код; якщо невживаний — прибрати експорт).
- `PickList.tsx`:
  ```tsx
  export interface PickItem { id: string; name: string; meta?: ReactNode }
  /** 69: список з прапорцями — «Вибрати всі» і одна дія над вибраними замість кнопки біля кожного рядка. */
  export function PickList({ title, items, action, danger, busy, onRun }: { title: string; items: PickItem[]; action: string; danger?: boolean; busy: boolean; onRun: (picked: PickItem[]) => Promise<boolean> }): JSX.Element
  ```
  Стан `picked: Set<string>`; видимий вибір = `items.filter(i => picked.has(i.id))` (зниклі після перечитування випадають самі). «Вибрати всі» — `checked` = всі вибрані, `indeterminate` через `ref` + `useEffect`. `fieldset.admin-pick` + `legend.sr-only` = `t('adminPickLegend', { title })`; рядки — `ul.admin-pick-rows > li.admin-pick-row > label.field.field-check` (прапорець + `name` з `dir="auto"`) і `meta` поруч; кнопка — `btn` / `btn btn-danger`, `disabled={busy || chosen.length === 0}`; після `onRun` → `true` вибір очищається.
- `bulk.ts`:
  ```ts
  /** 69: масова дія — запити по черзі; предмета вже немає (not_found / gift_not_found) — пропуск, інша помилка — зупинка. */
  export async function runEach<T>(items: readonly T[], run: (item: T) => Promise<ApiResult<object>>): Promise<ApiResult<{ done: number; skipped: number }>>
  ```
- `CardAchievements.tsx`: список отриманих — `PickList` (`name` = `nameOf(id)`, `meta` = дата), `action = t('adminCardRevokePicked')`, `danger`; `onRun` → `act(t('adminCardRevokePickedConfirm', { nickname, count: picked.length, names: picked.map(p => p.name).join(', ') }), async () => { const r = await revokeAchievements(user.id, ids); if (r.ok && r.notOwned.length > 0) setNotice(t('adminCardRevokePartial', { done: r.revoked.length, count: ids.length })); return r; }, setError)`. Додати рядок стану `<p className="meta admin-card-line" role="status">{notice}</p>` (як у `CardXp`). Кнопку «Відібрати» біля кожного рядка прибрати. Блок «— Забрано адміністратором» і форма видачі — без змін (компактно: селект і кнопка в один ряд на широкому, `admin-card-form` лишається).
- CSS: `.admin-pick-rows` (grid, gap 0.25rem, без маркерів), `.admin-pick-row` (`display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.6rem; min-height: 2.75rem`), `.admin-pick-all` (той самий вигляд, роздільник знизу). Ціль дотику прапорця ≥ 2.75rem через `label`.

**Тести:**
- `bulk.test.ts`: усі ок → `{ done: 2, skipped: 0 }`; `not_found` на одному → `skipped: 1`, решта зроблено; `restarting` на другому → `{ ok: false, error: 'restarting' }`, третій не викликано.
- `AdminUser.test.tsx`: переписати «grants … and revokes with a confirm» → видача як була; далі `getByRole('checkbox', { name: 'Перша гра' })` → «Відібрати вибрані» стає активною → клік → `window.confirm` з переліком → `sent('POST', '/api/admin/users/u2/achievements/revoke')[0].body` = `{ achievementIds: ['first_game'] }`; біля рядків немає кнопки «Відібрати» (`queryByRole('button', { name: 'Відібрати' })` — null). «Вибрати всі» вибирає все й показує `indeterminate` при частковому виборі. «a declined confirm sends nothing» — через прапорець і «Відібрати вибрані». «an achievement … already taken in another tab» — `reply` для POST `/achievements/revoke` → 404 `achievement_not_owned`: помилка в розділі, картка перечитана. Новий: часткова відповідь `200 { revoked: ['first_game'], notOwned: ['first_win'] }` → рядок стану «Відібрано 1 з 2; …». «a failed reread … stale» — через нову дію.
- Порожній вибір: кнопка неактивна.

**Перевірка:** `pnpm vitest run apps/web/src/admin --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): achievements on the player card — pick several and revoke them with one confirm (69)`

---

### Задача 7. Призи: масове видалення зі складу й прибирання з вітрини

**Файли:** `apps/web/src/admin/card/CardPrizes.tsx`; `apps/web/src/admin/AdminUser.test.tsx`, `apps/web/src/admin/AdminUsers.test.tsx`.

**Зміни:**
- «Склад»: `PickList` (`name` = `prize.content.name`), `action = t('adminCardDeletePicked')`, `danger`; `onRun` → `act(t('adminCardDeletePickedConfirm', { nickname, count, names }), () => partial(runEach(picked, (p) => deletePrizeAsAdmin(p.id))), report)`.
- «Вітрина»: `PickList` з усіма нагородами: подарунок — `name` = назва, `meta` = `awardGiftLine` + примітка; нагорода з гри — `name` = `«quizTitle»`, `meta` = `adminPlace` + гравіювання/титул в один рядок через « · ». `action = t('adminCardRemovePicked')`, `danger`; `onRun` → `runEach(picked, (a) => a.gift !== null ? revokeGift(a.id) : deleteAwardAsAdmin(a.id))`.
- `partial` — обгортка в компоненті: якщо `skipped > 0`, пише в рядок стану `t('adminCardPickedPartial', { done, count })`. Додати `<p className="meta admin-card-line" role="status">`.
- `CardAct` лишається як є: `runEach` повертає `ApiResult`, а `not_found` предмета вже поглинутий `runEach`, тож масова дія не веде на головну.
- Форма «Подарувати приз» — без змін, лише всередині розділу.

**Тести:**
- `AdminUser.test.tsx` «gifts one of my prizes with a note and revokes a gift»: подарунок як був; прибирання — прапорець «Зірка» → «Прибрати вибрані» → confirm `Прибрати з вітрини Оля (1): Зірка? …` → `DELETE /api/admin/gifts/…`. «an … gift already taken» — `reply` для `DELETE /api/admin/gifts/…` → 404 `gift_not_found`: рядок стану «Зроблено 0 з 1; …», картка перечитується, не головна.
- Новий: вітрина з подарунком і нагородою з гри, вибрати обидва → два запити: `DELETE /api/admin/gifts/<gift>` і `DELETE /api/admin/awards/<award>`, одне підтвердження.
- `AdminUsers.test.tsx` (describe AdminUser, моки `deletePrizeAsAdmin`/`deleteAwardAsAdmin`): тест видалення приза складу — через прапорець і «Видалити вибрані», `deletePrizeAsAdmin` викликано з `'p1'` один раз після одного `confirm`.

**Перевірка:** `pnpm vitest run apps/web/src/admin --maxWorkers=2`; `pnpm typecheck`.

**Коміт:** `feat(web): prizes on the player card — pick several to delete from stock or remove from the showcase (69)`

---

### Задача 8. E2E під нову розмітку

**Файли:** `apps/server/e2e/part17-21-likes-feed-calendar-push-admin.e2e.ts`, `apps/server/e2e/part58-player-card.e2e.ts`, `apps/server/e2e/part66-merge-accounts.e2e.ts`.

**Зміни:**
- Спільний підхід у кожному файлі: помічник `openSection(page, heading)` — знаходить `section.admin-card-section` з `h2` `heading` і, якщо `details` закритий, клікає `summary`; чекає `details[open]`.
- part17-21 (крок 21a): у списку `admin.locator('.admin-card', { hasText: 'bohdan21a@example.com' })` → `admin.locator('li.admin-user-row', { hasText: … })`; перед полем «Причина…» — `openSection(admin, 'Модерація')`; крок 7 (приз зі складу): `openSection(admin, 'Призи')`, прапорець з назвою `PRIZE` → «Видалити вибрані» (діалог підтвердження — як наявні `confirm` у цьому файлі); `Порожньо.` ×2 лишається; крок 9 (розбан): `openSection(admin, 'Модерація')` перед «Розблокувати». `.admin-mark.is-banned` тепер у шапці картки — без змін.
- part58: список — `li.admin-user-row` (кроки 1 і 6: `li.admin-card` → `li.admin-user-row`); перед знімками розділів (`sectionShot`) — `openSection`; перевірка огляду — розділ уже відкритий. Крок 2: після видачі рядок — `achievements.locator('li.admin-pick-row', { hasText: ACHIEVEMENT })`; відбирання — `achievements.getByRole('checkbox', { name: ACHIEVEMENT, ...exact }).check()` → `getByRole('button', { name: 'Відібрати вибрані', ...exact }).click()`; чекати `detached` рядка `li.admin-pick-row`. Кроки 3–5: `openSection` для «Досвід», «Призи», «Останні ігри», «Модерація» (розділ модерації тепер шукати за заголовком «Модерація», а не за кнопкою). Подарунок: рядок `li.admin-pick-row` з «Подарунок від адміністратора» → прапорець → «Прибрати вибрані». Крок 6: `openSection(admin, 'Видалити акаунт')`. Додати перевірку: на картці спершу відкритий лише «Огляд» (`details[open]` = 1), і кадр `card69-folded-360` (вся картка згорнута вміщається майже на один екран).
- part66: `openSection(admin, HEADING)` і `openSection(dark, HEADING)` перед діями об'єднання.
- Без бічного скролу на 360 px (наявні `expectNoSideScroll`/`noSideScroll`) — і для списку користувачів (новий кадр `users69-list-360` у part58, світла й темна теми).

**Перевірка:** `pnpm typecheck` (включно з `apps/server/e2e`); e2e цих трьох частин: `pnpm build` і `pnpm vitest run --config apps/server/e2e/vitest.config.ts part17-21 part58 part66 --maxWorkers=2` (потрібен локальний Postgres, як для решти e2e).

**Коміт:** `test(e2e): admin users list rows, folded card sections and bulk revoke in parts 21a, 58 and 66 (69)`

---

### Задача 9. Фінальна перевірка

**Файли:** —

**Кроки:** `pnpm typecheck`; `pnpm vitest run --maxWorkers=2` (увесь набір); e2e з задачі 8; вручну на dev-сервері (світла й темна тема, 360 px і широкий екран): список — рядок на людину, клік по будь-якому місцю рядка відкриває картку; картка — відкритий лише «Огляд», лічильники в summary, масове відбирання досягнень з одним підтвердженням, у журналі (`/admin/log`) — окремий запис на кожне забране досягнення / приз. Зупинити dev-сервери після перевірки.

**Коміт:** не потрібен (лише якщо фінальне рев'ю щось виправило: `fix(web): … (69)`).

---

## Рішення власника

1. **Позначки в рядку списку.** Прохання — «лише нік, дата реєстрації та емейл і все». План лишає маленькі бейджі «Адмін» / «Заблоковано» біля ніку (рядок від них не росте), бо інакше заблокованого видно лише в картці. Якщо треба строго три поля — прибрати два `span` у `UserRow` (одна правка).
2. **Початковий стан розділів.** План: відкритий лише «Огляд». Альтернатива — пам'ятати, які розділи адмін відкривав (sessionStorage), щоб на наступній картці вони відкривались самі. Не входить у план; можна додати пізніше.
