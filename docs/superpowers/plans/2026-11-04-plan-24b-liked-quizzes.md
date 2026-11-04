# План 24b: «Вподобання» — переглянути вікторини, які сподобались мені й іншим

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** на /profile/likes під трьома числами — дві вкладки: «Мені сподобались» (вікторини, яким я ставив ❤️ вікторині чи запитанням) і «Сподобались іншим» (мої вікторини, що зібрали ❤️), з розгортанням, порожніми станами й «Показати ще» по 20 рядків.

**Spec:** `docs/superpowers/specs/2026-11-04-likes-lobbies-looks-design.md` — лише частина **«24b»**, **«Загальні обмеження»** і **«Рішення після перевірки builder-ом» → 24b** (обов'язкові). 24c і 24d — не в цьому плані.

**Архітектура:**
- **shared** (`packages/shared/src/likes.ts`): типи рядків і сторінки, `LIKES_PAGE = 20`, схема `offset`.
- **сервер:** дві функції сховища в `apps/server/src/like-store.ts` (`givenLikes`, `receivedLikes`) читають `user_like` + `quiz` + `profile`, групують за `quiz_id`; два маршрути `GET /api/me/likes/given` і `GET /api/me/likes/received` у `apps/server/src/profile-routes.ts`. Міграції **немає** (індекси `user_like_user_idx`, `user_like_quiz_idx`, `quiz_owner_idx` уже є).
- **веб:** новий компонент `apps/web/src/profile/LikedQuizzes.tsx` (вкладки + списки) під `LikesCard` на `ProfileLikes`; `PublicProfile` не змінюється.

**Технології:** TypeScript, zod, Fastify, Drizzle + PGlite (тести), React 19 + Testing Library (jsdom), Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`); нічого з 24b не йде в `GameState`/`SavedRoom`.
- Тема «Кривавий місяць» (23a) лишається; нове — лише наявними змінними (`--surface`, `--line`, `--paper`, `--dim`, `--accent`, `--accent-text`, `--link`) у `apps/web/src/styles.css`.
- Усі нові рядки — у 7 мовах (uk в `apps/web/src/i18n.ts`; en, pl, de, es, it, ar у `apps/web/src/locales/<lang>.json`), тон «ти»; ru — ніколи; нічого, пов'язаного з росією. Шлях: `pnpm l10n todo <lang>` → переклад у файл у scratchpad → `pnpm l10n merge <lang> <file>`; `pnpm l10n check <lang>` чисто для en pl de es it ar. Множинні ключі — усі форми, які просить `l10n todo` (в ar: zero/one/two/few/many/other).
- Нові uk-ключі — **лише** зі списку `ADDED_24B` (тексти — задача 3), список дописує в `apps/web/src/i18n.test.ts` задача 2.
- Доступність: контраст ≥ AA, фокус видно, усе з клавіатури, зони дотику ≥ 44 px; RTL для арабської (логічні властивості CSS: `margin-inline-*`, `inset-inline-*`, `text-align: start`).
- Приховані (`hidden = true`) вподобання не рахуються; списки — лише вікторини й запитання (`kind in ('quiz','question')`); host/player/event — лише в трьох числах, як зараз.
- Списки бачить лише власник (маршрути `/api/me/...`, 401 без входу); публічний профіль не змінюється.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`; e2e — спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<шаблон>"`, лише на передньому плані.
- Кожна задача закінчується комітом у гілці `liked-quizzes` (з `main`).

## Рішення (там, де специфікація лишила місце builder-ові)

- **Видалена вікторина** у «Мені сподобались» — рядок «Вікторину видалено» (наявний ключ `calendarQuizGone`), дата «востаннє», без автора, без лічильника, без розгортання. У «Сподобались іншим» — зникає (вибірка йде від наявних `quiz`).
- **Рішення 1 (приватна/схована вікторина):** у проєкті немає видимості вікторини — нічого окремо робити не треба; рядок показується, поки вікторина існує.
- **Рішення 2 (змінене/прибране запитання):** прибране запитання (`hidden = true`, вікторина є) не входить у лічильник рядка й не має тексту; у розгортанні — один рядок «ще N запитань змінено чи прибрано» (`gone`). Змінене, але з тим самим id — показуємо *поточний* текст (знімка немає й не робимо). Вікторина, де всі мої вподобання приховані (`count = 0`, вікторина є), — рядка немає.
- **Тексти запитань** — з поточної вікторини за id: основні (`roundQuestions` усіх раундів) і запасні (`allSpares`), у порядку вікторини; відповідей не віддаємо — лише `question.text`.
- **Автор** — `ProfileCard` (id, nickname, avatar) з `profile`; веб: `Avatar size="small"` + нік (`nickText`) посиланням на `/profile/<id>`.
- **Порядок:** «Мені» — `max(created_at)` усіх моїх рядків вікторини (зокрема прихованих) спадно, далі `quiz_id`; «Іншим» — `total` спадно, далі `title` за зростанням, далі `quiz_id`. Топ запитань — `count` спадно, при рівності — порядок у вікторині; до 3.
- **Сторінки:** `?offset=N` (ціле 0…10 000, інакше 400), по `LIKES_PAGE = 20`; сервер бере 21 рядок, `next = offset + 20`, якщо є 21-й, інакше `null`. Веб — кнопка «Показати ще» (наявний `feedMore`).
- **Вкладки:** WAI-ARIA tabs: `role="tablist"` з `aria-label`, дві `role="tab"` з `aria-selected`/`aria-controls`, `role="tabpanel"`; ←/→/Home/End переводять фокус і вибір (з двома вкладками будь-яка стрілка — на другу, тож RTL однаковий). Типово відкрита «Мені сподобались». Дані вкладки вантажаться при першому відкритті й не перевантажуються при поверненні.
- **Розгортання** — кнопка «Запитання» з `aria-expanded`, лише в рядку «Мені», коли є що показати (`questions.length > 0 || quizLiked || gone > 0`).
- **Обмеження частоти** маршрутів: 60 / хв на людину (як `/api/me/feed`).

## Review Focus

- Вікторину видалили після вподобань — «Мені» показує рядок «Вікторину видалено» без помилки й без розгортання, «Іншим» його не має (задача 1 і 2, тести `deleted quiz`).
- Автор прибрав вподобане запитання — у рядку «Мені» лічильник без нього, текст не видно, є «ще 1 запитання змінено чи прибрано»; у «Іншим» запитання не в топі (задача 1, `removed question`).
- Рівно 20 і 21 вікторина — на 20 немає «Показати ще», на 21 — є, і друга сторінка не дублює першої (задача 1 `pages`, задача 2 `more`).
- Нік автора `null` (не пройшов правил) чи автор без аватара — підставка `nickText`, без падіння (задача 2, `author without nickname`).
- Арабська на 320 px: довгі назви й тексти запитань переносяться, без бокового скролу, дзеркальний порядок (задача 4).

---

### Задача 1. Сервер: списки «Мені сподобались» і «Сподобались іншим»

**Files:**
- Modify: `packages/shared/src/likes.ts` (нові типи, `LIKES_PAGE`, `likesOffsetSchema`)
- Modify: `apps/server/src/like-store.ts` (дві нові функції)
- Modify: `apps/server/src/profile-routes.ts` (два маршрути)
- Test: `apps/server/src/like-store.test.ts` (новий `describe('givenLikes, receivedLikes (24b)')`)
- Test: `apps/server/src/likes-routes.test.ts` (новий `describe('GET /api/me/likes/* (24b)')`)

**Interfaces:**
- Produces (shared, експорт через наявний `export * from './likes'`):
  ```ts
  export const LIKES_PAGE = 20;
  /** ?offset: ціле 0…10 000; рядок з query → число. */
  export const likesOffsetSchema: z.ZodType<number>; // z.coerce.number().int().min(0).max(10_000)
  export interface GivenLike {
    quizId: string;
    /** null — вікторину видалено. */
    quiz: { title: string; author: ProfileCard } | null;
    /** Мої видимі вподобання: вікторині (0/1) + запитанням; для видаленої — 0. */
    count: number;
    /** ISO; найпізніше created_at моїх рядків цієї вікторини (зокрема прихованих). */
    lastAt: string;
    /** Я вподобав саму вікторину (видимо). */
    quizLiked: boolean;
    /** Тексти моїх видимих вподобаних запитань у порядку вікторини; для видаленої — []. */
    questions: string[];
    /** Мої вподобання запитань, яких у вікторині вже немає (hidden); для видаленої — 0. */
    gone: number;
  }
  export interface ReceivedLike {
    quizId: string;
    title: string;
    /** Видимі вподобання вікторині + запитанням. */
    total: number;
    /** Різні люди серед них. */
    people: number;
    /** До 3 найвподобаніших запитань. */
    top: { text: string; count: number }[];
  }
  export interface LikesPage<T> { items: T[]; next: number | null }
  ```
  (`ProfileCard` — `import type` з `./profile`.)
- Produces (сервер): `givenLikes(db: Db, userId: string, offset: number): Promise<LikesPage<GivenLike>>`, `receivedLikes(db: Db, userId: string, offset: number): Promise<LikesPage<ReceivedLike>>`.
- Produces (HTTP): `GET /api/me/likes/given?offset=N` і `GET /api/me/likes/received?offset=N` → 200 `LikesPage<…>`; без входу 401 `{ error: 'unauthorized' }`; поганий offset 400 `{ error: 'invalid_payload' }`.

- [ ] **Step 1: Failing store tests** у `like-store.test.ts` (наявні `A`, `O`, `P`, `full()`, `like()`, `g1`; додати четвертого користувача й профілі з нікнеймами за потреби):
  ```ts
  it('given: рядок на вікторину, мої вподобання вікторині й запитанням, тексти в порядку вікторини', async () => {
    await like({ userId: O, kind: 'question', questionId: 'q2' });
    await like({ userId: O, kind: 'question', questionId: 'q1' });
    await like({ userId: O, kind: 'quiz' });
    const page = await givenLikes(db, O, 0);
    expect(page.next).toBeNull();
    expect(page.items).toEqual([{ quizId, quiz: { title: expect.any(String), author: { id: A, nickname: expect.anything(), avatar: null } }, count: 3, lastAt: expect.any(String), quizLiked: true, questions: [textOf('q1'), textOf('q2')], gone: 0 }]);
  });
  it('given: чужі вподобання й host/player/event не входять', ...);           // P лайкнув q1, O — host і player: givenLikes(O) = []
  it('given: новіші вище', ...);                                                // дві вікторини, createdAt різний → порядок за lastAt
  it('given: removed question — без тексту й лічильника, gone = 1', ...);       // updateQuiz(withoutQ2) після лайку q2 і q1 → count 1, questions [q1], gone 1
  it('given: усі мої вподобання приховані, вікторина є — рядка немає', ...);    // лише q2, потім withoutQ2
  it('given: deleted quiz — quiz null, count 0, questions [], gone 0', ...);    // deleteQuiz після лайку → один рядок, quiz: null
  it('received: total, people, top-3 з лічильником, лише мої вікторини', async () => {
    // O: q1, q2, quiz; P: q1 → receivedLikes(A) = [{ quizId, title, total: 4, people: 2, top: [{ text: textOf('q1'), count: 2 }, { text: textOf('q2'), count: 1 }] }]
  });
  it('received: removed question не рахується й не в топі; deleted quiz зникає', ...);
  it('received: більше вподобань — вище; рівно — за назвою', ...);
  it('pages: 20 → next null; 21 → next 20, друга сторінка — один інший рядок', ...); // 21 вікторина автора A, O лайкає кожну
  ```
  `textOf(id)` — текст запитання з `full()` за id (допоміжна функція в тесті). Рядки лайків з різними `createdAt` — прямою вставкою в `userLike` або `vi.setSystemTime`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/like-store.test.ts` → FAIL (`givenLikes is not a function` / імпорт).
- [ ] **Step 3: Implement** типи в shared і `givenLikes`, `receivedLikes` у `like-store.ts`:
  - `givenLikes`: SQL-групування `user_like` (user_id = me, kind in quiz/question) за `quiz_id` з `max(created_at)`, `count(*) filter (where not hidden)`, left join `quiz`; лишити групи, де `quiz.id is null` або видимих > 0; order by `max(created_at) desc, quiz_id`; `limit 21 offset N`. Потім для цих quizId — одним запитом рядки (kind, question_id, hidden) і `profile` авторів (`inArray`), тексти — з `quiz.rounds`/`settings.spares` через `roundQuestions` і `allSpares` з `@quiz/shared`.
  - `receivedLikes`: join `quiz` (owner_id = me) з `user_like` (hidden = false, kind in quiz/question) групуванням за `quiz.id`: `count(*)`, `count(distinct user_id)`; order by `total desc, title, id`; `limit 21 offset N`; топ — другим запитом `count` за `(quiz_id, question_id)` для kind question у цих вікторинах, тексти з вікторини.
  - `lastAt` — `toISOString()`.
- [ ] **Step 4: Run** той самий тест → PASS.
- [ ] **Step 5: Failing route tests** у `likes-routes.test.ts`:
  ```ts
  it('given/received only for the signed-in owner, offset validated', async () => {
    // owner створює вікторину, інший (signUp) лайкає її q1 через saveLike
    expect((await get('/api/me/likes/given')).statusCode).toBe(401);
    expect((await get('/api/me/likes/received')).statusCode).toBe(401);
    expect((await get('/api/me/likes/given', other.cookie)).json()).toMatchObject({ items: [{ quizId, count: 1 }], next: null });
    expect((await get('/api/me/likes/received', owner.cookie)).json()).toMatchObject({ items: [{ quizId, total: 1, people: 1 }], next: null });
    expect((await get('/api/me/likes/received', other.cookie)).json()).toEqual({ items: [], next: null });
    for (const bad of ['-1', 'abc', '1.5', '10001']) expect((await get(`/api/me/likes/given?offset=${bad}`, other.cookie)).statusCode).toBe(400);
    // ідентифікаторів тих, хто лайкнув, у received немає
    expect((await get('/api/me/likes/received', owner.cookie)).body).not.toContain(otherId);
  });
  ```
- [ ] **Step 6: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/likes-routes.test.ts` → FAIL (404).
- [ ] **Step 7: Implement** маршрути в `registerProfileRoutes`: `app.get<{ Querystring: { offset?: string } }>('/api/me/likes/given', perUser…60/хв, …)`, так само `received`; `offset` відсутній → 0, інакше `likesOffsetSchema.safeParse`. Обмеження частоти — як у `feed-routes.ts` (`keyGenerator` за id користувача).
- [ ] **Step 8: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server/src/like-store.test.ts apps/server/src/likes-routes.test.ts packages/shared` → PASS.
- [ ] **Step 9: Commit** `feat(server): 24b liked quizzes lists — given and received with pages`.

---

### Задача 2. Веб: вкладки «Мені сподобались» і «Сподобались іншим»

**Files:**
- Create: `apps/web/src/profile/LikedQuizzes.tsx`
- Create: `apps/web/src/profile/LikedQuizzes.test.tsx`
- Modify: `apps/web/src/api.ts` (дві функції)
- Modify: `apps/web/src/pages/profile/ProfileLikes.tsx` (рендерить `LikedQuizzes` під `LikesCard`)
- Modify: `apps/web/src/pages/profile/subpages.test.tsx` (мок двох нових функцій api)
- Modify: `apps/web/src/i18n.ts` (uk-ключі з задачі 3 — тут лише uk; інші мови — задача 3)
- Modify: `apps/web/src/styles.css` (блок `.liked-*` поряд із `.likes-tiles`)

**Interfaces:**
- Consumes: `GivenLike`, `ReceivedLike`, `LikesPage`, `LIKES_PAGE` (задача 1); `Avatar` (`apps/web/src/profile/Avatar.tsx`), `nickText`, `num`, `formatDate`, `t`, `countText`.
- Produces:
  ```ts
  // api.ts
  export const getLikesGiven = (offset = 0) => fetchData<LikesPage<GivenLike>>(`/api/me/likes/given?offset=${offset}`);
  export const getLikesReceived = (offset = 0) => fetchData<LikesPage<ReceivedLike>>(`/api/me/likes/received?offset=${offset}`);
  // LikedQuizzes.tsx
  export function LikedQuizzes(): JSX.Element;
  ```
- Розмітка (тести й e2e на неї спираються): `<section className="profile-section liked-quizzes">` → `div[role=tablist][aria-label=t('likedTabsLabel')]` → дві `button[role=tab]` (`likedMineTab`, `likedOthersTab`) → `div[role=tabpanel]` → `ul.liked-list` → `li.liked-row`. «Мені»: назва (`.liked-title`), автор (`a.liked-author[href=/profile/<id>]` з `Avatar small` і ніком), `❤️ num(count)` з прихованим від читача серцем і `countText('likedMineCount', count, { count })` для читача (або видимим підписом), `t('likedLastAt', { date: formatDate(lastAt) })`, кнопка `t('likedShowQuestions')` з `aria-expanded` → `ul.liked-questions` з рядком `t('likedQuizWhole')` (якщо `quizLiked`), текстами і `countText('likedGone', gone, { count: gone })` (якщо `gone > 0`). Видалена: `.liked-title` = `t('calendarQuizGone')`, лише дата. «Іншим»: назва — `Link` на `/quizzes/<quizId>`, `❤️ num(total)`, `countText('likedPeople', people, { count: people })`, `ol.liked-top` з `text` і `❤️ num(count)`. Порожньо: `p.liked-empty` з `likedMineEmpty` / `likedOthersEmpty`. Збій: `p.error` з `likedError` (`role="alert"`), без кнопки повтору; збій «Показати ще» лишає вже показані рядки. «Показати ще» — `button` з `t('feedMore')`, поки `next !== null`; додає рядки в кінець.

- [ ] **Step 1: Failing tests** у `LikedQuizzes.test.tsx` (мок `../api`, `MemoryRouter`):
  ```ts
  it('opens «Мені сподобались» first and lists rows: title, author link, count, date', ...);
    // getLikesGiven → 1 рядок; expect tab 'Мені сподобались' aria-selected 'true'; link name з ніком → href '/profile/a1'; текст містить '❤️ 3'
  it('expands the liked question texts and «уся вікторина», no answers', ...);
    // клік «Запитання» → aria-expanded 'true'; бачимо тексти; gone 1 → 'ще 1 запитання змінено чи прибрано'
  it('a deleted quiz is «Вікторину видалено» without the expand button', ...);
  it('author without nickname shows the fallback nick', ...);                 // nickname: null → nickText(null)
  it('«Сподобались іншим»: total, people, top questions, title opens the editor', ...);
    // клік вкладки → getLikesReceived викликано раз; link 'Моя вікторина' href '/quizzes/q1'; '2 людини'; ol.liked-top li ×3
  it('empty tabs show their hint', ...);                                       // обидві → items []
  it('more: «Показати ще» only while next is set; the next page appends', ...); // next 20 → клік → getLikesGiven(20); next null → кнопки немає
  it('arrow keys move between tabs; returning does not refetch', ...);         // ArrowRight → друга вкладка в фокусі й вибрана; ArrowLeft назад; getLikesGiven викликано 1 раз
  it('a failed load shows an error, not a crash', ...);
  ```
  У `subpages.test.tsx` — мок `getLikesGiven`/`getLikesReceived` → `{ ok: true, data: { items: [], next: null } }`; наявний тест «Вподобання» проходить і бачить вкладку «Мені сподобались».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile/LikedQuizzes.test.tsx` → FAIL (модуля немає).
- [ ] **Step 3: Implement** `LikedQuizzes`, api-функції, `ProfileLikes` (`<LikesCard …/><LikedQuizzes />` у тому ж `SubpageData`), uk-ключі (список — задача 3) і стилі: рядок — картка `--surface` з рамкою `--line`, назва `--paper`, вторинне `--dim`, посилання `--link`; вкладки — підкреслення `--accent` у вибраної, `:focus-visible` обвідка; кнопки й вкладки `min-height: 2.75rem`; `overflow-wrap: anywhere` для назв і текстів; лише логічні властивості (RTL).
- [ ] **Step 4: Дописати `ADDED_24B`** (список — у задачі 3) у `describe('uk golden (22a)')` файла `apps/web/src/i18n.test.ts` і в фільтр тесту «adds no uk keys beyond the agreed list».
- [ ] **Step 5: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS (перевірки інших мов, якщо падають на відсутніх перекладах, лагодить задача 3).
- [ ] **Step 6: Commit** `feat(web): 24b «Мені сподобались» and «Сподобались іншим» tabs on /profile/likes`.

---

### Задача 3. Переклади: нові рядки 24b у 7 мовах

**Files:**
- Modify: `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Check: `apps/web/src/i18n.test.ts` (`ADDED_24B` з задачі 2 збігається з реальними uk-ключами)
- Modify (за потреби): `apps/web/src/i18n.ts` (лише якщо задача 2 щось пропустила)

**Interfaces:**
- Consumes: uk-ключі задачі 2.
- uk-тексти (точні; рецензент звіряє):
  ```ts
  likedTabsLabel: 'Вподобані вікторини',
  likedMineTab: 'Мені сподобались',
  likedOthersTab: 'Сподобались іншим',
  likedMineEmpty: 'Тут будуть вікторини, яким ти поставиш ❤️. Став ❤️ запитанням під час гри.',
  likedOthersEmpty: 'Коли гравцям сподобаються твої вікторини чи запитання, вони з’являться тут.',
  likedMineCount_one: '{count} моє вподобання', likedMineCount_few: '{count} мої вподобання', likedMineCount_many: '{count} моїх вподобань',
  likedPeople_one: '{count} людина', likedPeople_few: '{count} людини', likedPeople_many: '{count} людей',
  likedGone_one: 'ще {count} запитання змінено чи прибрано', likedGone_few: 'ще {count} запитання змінено чи прибрано', likedGone_many: 'ще {count} запитань змінено чи прибрано',
  likedLastAt: 'востаннє {date}',
  likedShowQuestions: 'Запитання',
  likedQuizWhole: '❤️ уся вікторина',
  likedError: 'Не вдалося завантажити вподобання',
  ```
  Наявні й повторно вжиті: `feedMore`, `calendarQuizGone`.
- Produces: `const ADDED_24B = ['likedTabsLabel', 'likedMineTab', 'likedOthersTab', 'likedMineEmpty', 'likedOthersEmpty', 'likedMineCount_one', 'likedMineCount_few', 'likedMineCount_many', 'likedPeople_one', 'likedPeople_few', 'likedPeople_many', 'likedGone_one', 'likedGone_few', 'likedGone_many', 'likedLastAt', 'likedShowQuestions', 'likedQuizWhole', 'likedError'];` (якщо `i18n.ts` тримає множинні форми інакше — `_other` тощо, список відповідає реальним uk-ключам).

- [ ] **Step 1: Звірити** uk-тексти в `i18n.ts` з переліком вище й `ADDED_24B` з реальними ключами; `pnpm vitest run --maxWorkers=2 apps/web/src/i18n.test.ts -t "uk golden"` → PASS.
- [ ] **Step 2: Переклад** для кожної з en pl de es it ar: `pnpm l10n todo <lang>` → JSON у scratchpad → `pnpm l10n merge <lang> <file>`. «Сподобались іншим» — сенс «мої вікторини, які сподобались іншим людям» (en «Liked by others»); `{count}`/`{date}` не перекладати; ❤️ лишити. Без слів, пов'язаних з росією.
- [ ] **Step 3: Run** `for l in en pl de es it ar; do pnpm l10n check $l; done` → чисто; `pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 4: Commit** `feat(web): 24b liked lists in all seven languages`.

---

### Задача 4. e2e: сценарій «part 24b»

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 24b: …')` і `async function likedQuizzes24b()` після блоку 24a)

**Interfaces:**
- Consumes: розмітка задачі 2 (`section.liked-quizzes`, `role=tab`, `li.liked-row`, `.liked-title`, `a.liked-author`, `ol.liked-top`, `p.liked-empty`), маршрути задачі 1; наявні хелпери `open`, `register`, `myId`, `shot`, `expectNoSideScroll`, `htmlLang`, `exact`, `POLL`, `db`, `userLike`; `makeRoundsQuiz`/`classicRound` або `makeQuiz` з тестовими запитаннями з власними текстами (без росії).

- [ ] **Step 1: Написати сценарій** — назва: `'part 24b: liked quizzes — Оля sees the quizzes she liked newest first with the author link and her liked question texts, a deleted quiz stays as «Вікторину видалено», the author sees «Сподобались іншим» with totals, people and top questions that open the editor, Петро gets the empty hints, the tabs work from the keyboard, 320 px in uk and ar has no side scroll, and the public profile shows no lists'`. Кроки:
  1. Реєстрація `Авторка 24b` (1280×800), `Оля 24b`, `Петро 24b` (375×812); `myId` кожного. Авторка через `POST /api/quizzes` створює три вікторини «Ліси Карпат 24b» (запитання k1–k3), «Річки 24b» (r1–r2), «Тимчасова 24b» (t1).
  2. Вподобання — прямою вставкою в `userLike` (kind, `targetUserId` = авторка, `quizId`, `questionId`, `gameId: randomUUID()`, `hidden: false`, `createdAt` з різницею в хвилину): Оля — «Тимчасова» quiz (найстаріше), «Річки» r1, «Ліси» k1, k2 і quiz (найновіше); Петро — «Ліси» k1. Потім Авторка `DELETE /api/quizzes/<Тимчасова>`.
  3. Оля: `/profile/likes` → вкладка «Мені сподобались» `aria-selected="true"`; `.liked-title` по порядку: `['Ліси Карпат 24b', 'Річки 24b', 'Вікторину видалено']`; у першому рядку `❤️ 3` і посилання автора → клік веде на `/profile/<id авторки>`, назад; «Запитання» → видно тексти k1 і k2 (не k3) і «❤️ уся вікторина»; у рядку видаленої немає кнопки «Запитання». `shot(olya, 'p24b-mine')`.
  4. Клавіатура: фокус на вкладці «Мені…», `ArrowRight` → «Сподобались іншим» у фокусі й `aria-selected="true"`; у Олі — `p.liked-empty`.
  5. Авторка: `/profile/likes` → «Сподобались іншим»: рядки `['Ліси Карпат 24b', 'Річки 24b']` (видаленої немає); у «Ліси» `❤️ 4`, «2 людини», `ol.liked-top li` перший — текст k1 з `❤️ 2`; клік по назві → `waitForURL(/\/quizzes\/<id Лісів>$/)`. `shot(author, 'p24b-others')`.
  6. Порожні стани: у Авторки «Мені сподобались» — `p.liked-empty` з `likedMineEmpty`; у Петра «Мені сподобались» — один рядок «Ліси Карпат 24b» з `❤️ 1`, а «Сподобались іншим» — `p.liked-empty` з `likedOthersEmpty`.
  7. Розкладка: Оля на 320 і 375 px, `PUT /api/me/locale` uk і ar, розгорнутий перший рядок: `expectNoSideScroll(olya, 'p24b-<lang>-<width>')`; в ar `html[dir=rtl]` і `a.liked-author` праворуч від `.liked-title`-краю (або просто `shot`); повернути uk.
  8. Публічний профіль: Оля відкриває `/profile/<id авторки>` → `section.likes-card` є, `section.liked-quizzes` — 0.
- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 24b"` → PASS; переглянути кадри `p24b-*` (рядки читаються, фокус видно, нічого не обрізано).
- [ ] **Step 3: Run** суміжні наявні: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part (17a|23a|24a)"` → PASS (профіль і сторінка вподобань не зламані).
- [ ] **Step 4: Commit** `test(e2e): part 24b liked quizzes on /profile/likes`.
