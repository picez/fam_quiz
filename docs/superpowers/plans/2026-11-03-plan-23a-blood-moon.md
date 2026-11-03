# План 23a: «Кривавий місяць» — нова тема всього сайту, меню з 5 пунктів, профіль із плиток і вітрини, які обирає гравець

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:**
- одна нова темна тема «Кривавий місяць» (варіант B) на всіх сторінках, у грі на телефоні, на сцені й у ведучого;
- власні мотиви (червоний місяць, ворони, хмаринка, кільце з томое) — CSS та inline SVG;
- меню з 5 пунктів: Приєднатися · Стрічка · Мої вікторини · Історія · Профіль;
- власний профіль = шапка + 8 плиток + вітрина кубків + ачівки + найпопулярніші вікторини; кожна плитка — окрема підсторінка;
- гравець закріплює до 3 призів і до 5 ачівок; закріплене зберігається на сервері й видно на публічному профілі.

**Spec:** `docs/superpowers/specs/2026-11-03-akatsuki-redesign-design.md`. Читати повністю, особливо «Анти-цілі», «Обмеження» й **«Рішення після перевірки builder-ом» (обов'язкові)**. Мокапи: `.superpowers/brainstorm/67830-1793721675/content/` — `akatsuki-directions.html` (варіант **B**), `profile-structure.html`, `profile-showcase.html`.

**Передумова:** у `main` усе до 22a і логічна вікторина. Міграції до `0029_nickname_null` зайняті; наша — **`0030_showcase_pins`** (journal idx 30).

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Вітрини не в `GameState`/`SavedRoom`. Пуш у `main` не обриває живих ігор.

**Архітектура:**
- **Тема** — лише CSS-змінні в `:root` файла `apps/web/src/styles.css` (старі імена змінних лишаються, змінюються значення, додаються кілька нових). Без нових бібліотек.
- **Мотиви** — `apps/web/src/motifs/Motifs.tsx`: чотири маленькі компоненти з inline SVG / CSS-градієнтом, усі `aria-hidden`.
- **Вітрини:**
  - shared `packages/shared/src/showcase.ts` — ліміти, схема закріплення, чисті функції вибору для полиці;
  - сервер — таблиця `showcase_pin`, сховище `showcase-pins.ts`, маршрути `/api/me/showcase/pins`;
  - `Showcase` (наявний тип вітрини) дістає поле `pins`. Так публічний профіль віддає закріплене, а набір його верхніх ключів не змінюється.
- **Профіль:** `/profile` (головна) і вісім підсторінок `/profile/<розділ>`. Старі `/prizes`, `/achievements`, `/friends` рендерять ті самі компоненти (аліаси, не редірект).

**Технології:** TypeScript, React 19, react-router, Vite, zod, Fastify, Drizzle + drizzle-kit + PGlite, vitest + Testing Library (jsdom), Playwright (e2e через vitest).

## Рішення (там, де специфікація лишила місце будівникові або мовчить)

- **Токени теми** (значення фіксовані; рецензент звіряє з цим списком):
  - `--stage: #060505` (тло);
  - `--surface: #0f0b0b` (нова: картки, плитки, поля);
  - `--line: #2a1a1a` (рамки);
  - `--paper: #f3eaea` (текст);
  - `--dim: rgb(243 234 234 / 0.7)`;
  - `--accent: #e02531` (нова: заливки кнопок, активні смужки, рамки аватарів, фокус);
  - `--accent-text: #ff4651` (нова: червоний текст і числа на темному);
  - `--link: #ff6b72` (нова: посилання);
  - `--on-accent: #ffffff` (нова: текст на `--accent`);
  - `--amber: var(--accent-text)` — 147 наявних місць стають червоними без перейменування;
  - `--spot: rgb(224 37 49 / 0.12)` — ледь помітний червоний відблиск угорі `body`;
  - `--panel: var(--surface)`;
  - `--signal: #ff4651` (помилки, небезпечні дії);
  - `--wrong: #ff8fa3` (нова: «неправильно» в грі);
  - `--correct: #3ddcc0` — без змін;
  - `--radius: 0.5rem`, `--radius-small: 0.375rem` (нові).
  - Інші ігрові кольори (`--bank`, `--final-gold`, `--team-*`, `--pending` тощо) не змінюються: вони мають значення в грі, а червоний лишається акцентом.
- **Кнопка `.btn-primary`:** тло `var(--accent)`, текст `var(--on-accent)`. Контраст #fff на #e02531 ≈ 6.0. Текст `--accent` на тлі заборонений (≈ 3.4, нижче AA), тому для тексту є `--accent-text` (≈ 6.0 на `--stage`).
- **Радіуси:** `border-radius` 0.625rem / 0.75rem / 0.875rem / 1rem (і `1rem 1rem 0 0` → `var(--radius) var(--radius) 0 0`) стають `var(--radius)`. 50%, 999px, 0, `inherit` і менші за 0.5rem лишаються.
- **Без «скла»:** три `backdrop-filter` прибрати, тло — непрозоре (`--notice-bg: rgb(6 5 5 / 0.94)`, `--splash-bg: rgb(6 5 5)`).
- **«Неправильно» в грі** (рішення 3 специфікації):
  - колір `--wrong` (рожево-червоний, світліший і холодніший за акцент) замість `--signal` у всіх правилах `.is-wrong`;
  - **обов'язкова позначка ✗** через CSS `content: '✗' / ''` (порожній alt: читач екрана її не озвучує, текст вердикту вже є) на `.choice.is-wrong`, `.spotlight-answer.is-wrong`, `.duel-stage-answer.is-wrong`, `.result.is-wrong h2`;
  - `.tag.is-wrong` і `.blitz-mark.is-wrong` уже мають текст (✗ / «відключився») — лише колір;
  - зелений «правильно» лишається.
- **Мотиви:**
  - місяць — `div` з radial-gradient (#ff3b3b → #9b0c14 → #4a0508), м'яке сяйво `box-shadow`, без картинок;
  - ворони — 2–3 власні силуети в одному `<svg>`;
  - хмаринка — власна форма: червона заливка `--accent`, білий контур;
  - кільце томое — SVG-кільце з трьома томое навколо аватара в шапці (власного й чужого профілю).
  - Де: місяць + ворони — у шапці профілю (обох), на головній над полем коду, на сторінці входу; хмаринка — у порожніх станах вітрин і на екрані `ErrorBoundary`; у грі (`.game-bg` на `main` сторінок Play, Host, Stage) — лише слабкий місяць фоном (`::before`, opacity ≤ 0.12, `pointer-events: none`, під вмістом). Сторінки без героя мають лише відблиск `--spot` з `body`.
  - Рух (повільний дрейф воронів) — лише всередині `@media (prefers-reduced-motion: no-preference)`. Місяць не анімується.
  - Позиції — логічними властивостями (`inset-inline-end`), бо `styles-rtl.test.ts` забороняє фізичні.
- **Меню:** підписи не змінюються («Мої вікторини» лишається, короткий «Квізи»). Пункти «Призи», «Досягнення», «Друзі» зникають. Їхні uk-ключі (`menuPrizes`, `menuAchievements`, `menuFriends`, `menuShortPrizes`, `menuShortAchievements`, `menuShortFriends`) видаляються, якщо більше ніде не вживаються. «Профіль» активний на `/profile…`, `/prizes…`, `/achievements…`, `/friends…`. Бейдж запрошень лишається на «Профілі».
- **Крапка на «Друзях»:** запитів у друзі в даних немає (дружба — однобічне додавання), тож плитка «Друзі» без лічильника й без крапки. Запрошення в гру лишаються списком під шапкою й бейджем на «Профілі» в меню.
- **Чотири числа шапки** (рішення 6): ігор, перемог, влучність, проведено — `stats.games`, `stats.wins`, `stats.accuracy`, `stats.hosted` з `ProfileStats`, яку віддає й публічний профіль. Підписи — наявні `countText('statGames'|'statWins'|'statHosted')` і `t('statAccuracy')`.
- **Плашки шапки:** «Рів. N» — наявний `ProfileLevelMark`; «🏆 N перемог» — `` `🏆 ${n} ${countText('statWins', n)}` ``; титул (`nick-title`) — як зараз.
- **Що таке «Призи» плитки:** нинішня сторінка `/prizes` — це **склад** призів для своїх ігор, а закріплювати можна лише **виграні** нагороди (`prize_award`). Тому підсторінка «Призи» має два розділи: «Нагороди» (виграні, наявний `Showcase` з кнопкою 📌 на кожній) і «Мої призи» (склад, як зараз). Лічильник плитки «Призи» = кількість виграних нагород.
- **Лічильники плиток:** Вікторини = `profile.quizzes.length`, Призи = `profile.showcase.awards.length`, Досягнення = кількість отриманих. Інші плитки — без числа.
- **Маршрути підсторінок:** `/profile/quizzes`, `/profile/prizes`, `/profile/achievements`, `/profile/friends`, `/profile/stats`, `/profile/likes`, `/profile/looks`, `/profile/settings`. Статичні сегменти react-router ранжує вище за `/profile/:id` (публічний профіль; у специфікації названо `/u/…`, у коді це `/profile/:id`). id користувачів — випадкові рядки, збігу немає. Аліаси: `/prizes` → той самий елемент, що `/profile/prizes`; `/achievements` і `/friends` так само.
- **«‹ Назад»** на підсторінці — `Link` на `/profile`, не `history.back()`: працює й на глибокому посиланні. Публічні ачівки `/profile/:id/achievements` ведуть назад на `/profile/:id`. Шеврон — з класом `flip-rtl`.
- **Вхід:** незалогінений на будь-якій підсторінці чи аліасі → `/login?next=<encodeURIComponent(location.pathname)>`, тобто повернення на ту саму адресу.
- **«✎ Змінити нікнейм / аватар»** (наявний ключ `editProfile`) у шапці веде на `/profile/settings?edit=1`: там одразу відкритий `ProfileEditor`.
- **Вікторини:** на головній — топ-3 з кількістю ігор (`` `${plays} ${countText('statGames', plays)}` ``) і «усі ›» на `/profile/quizzes`, де весь список. Кнопку «Ще N» прибрано.
- **Полиця кубків:**
  - емодзі `TROPHY_EMOJI` (або 📜 для диплома без трофея, 🎁 для лише реального призу), **без живого 3D**: 3D відкривається лише в `PrizeViewer` на весь екран. Обмеження «не більше 3 одночасно» виконано з запасом;
  - перший предмет — у центрі й найбільший: порядок показу `[2-й, 1-й, 3-й]`;
  - дотик: `canViewPrize` → `PrizeViewer`; інакше диплом → наявне завантаження диплома; інакше це не кнопка;
  - під предметом — назва трофея (`trophyLabel`) або «Диплом» і назва вікторини.
- **Ачівки на профілі:** до 5 квадратиків-кнопок. Наведення дає `title`; дотик чи фокус показує назву в підписі під рядом (`aria-live="polite"`). Рамки «рідкісна» немає (рішення 1).
- **Автовибір, поки нічого не закріплено,** — окремо для кожного виду:
  - призи: спершу з трофеєм, потім дипломи, потім решта; у групі новіші вище;
  - ачівки: найновіші отримані (`earnedAt` спадно, `null` у кінці, за рівності — порядок `ACHIEVEMENTS`).
  - Щойно закріплено хоч один предмет цього виду — показується лише закріплене, у порядку закріплення. Перетягування немає.
- **Схема `showcase_pin`:**
  - ключ (`user_id`, `kind`, `item_id`); `slot` 0…ліміт−1 з унікальним індексом (`user_id`, `kind`, `slot`) — це база не пускає понад ліміт навіть за гонки; `pinned_at` — порядок;
  - `item_id` — id `prize_award` (uuid текстом) або `AchievementId`;
  - FK лише на `user` (cascade): предмети двох видів у різних таблицях.
  - Застарілі рядки (нагороду видалено) прибирає `pinItem` перед підрахунком і `deleteAward` у своїй транзакції. Читання завжди фільтрує по наявних нагородах і отриманих ачівках.
- **Закріплена нагорода старша за 60 найновіших** (`SHOWCASE_MAX`) однаково потрапляє в `showcase.awards`: `showcaseOf` дочитує закріплені id окремо.
- **API:**
  - `GET /api/me/showcase/pins` → `ShowcasePins`;
  - `POST /api/me/showcase/pins` з `ShowcasePin` → `ShowcasePins`. Повторне закріплення того самого — 200 без зміни порядку. 404 `not_found` — не своє чи не отримане; 409 `showcase_full` — ліміт; 400 `invalid_payload`;
  - `DELETE /api/me/showcase/pins/:kind/:id` → `ShowcasePins`, ідемпотентно; невідомий `kind` → 404;
  - 401 без сесії; запис — 30 за хвилину, як `WRITE_LIMIT` призів.
- **Повідомлення про ліміт** клієнт показує сам, ще до запиту, якщо закріплено вже стільки, скільки дозволено. Те саме — і на 409 від сервера. Жодної мовчазної заміни.
- **Публічний профіль:**
  - та сама `ProfileHeader` без посилання редагування й без смужки рівня (її в публічних даних немає);
  - під шапкою дії дружби як зараз;
  - далі полиця (кнопка «Усі нагороди (N)» розгортає наявну сітку `Showcase` на місці), ачівки (5 квадратиків, «усі ›» на `/profile/:id/achievements`), `LikesCard`, «Статистика» (`StatsView`), `VersusBlock`;
  - плиток немає.
- **Широкий екран:** від 960 px головна профілю у дві колонки: ліворуч шапка, запрошення й плитки, праворуч вітрини й вікторини. Плитки по 4 в ряд на будь-якій ширині.

## Глобальні обмеження

- `GAME_STATE_VERSION` = 22 без змін. Рушій, `GameState`, `SavedRoom`, `restore.test.ts` не змінюються.
- Нова міграція лише одна: `0030_showcase_pins` (`pnpm --filter @quiz/server exec drizzle-kit generate --name showcase_pins`).
- Тема — лише CSS-змінні й правила в `apps/web/src/styles.css` (плюс `index.html` / `manifest.webmanifest` для кольору вікна). **Жодних нових UI-бібліотек і залежностей.**
- Мотиви — лише власні CSS / inline SVG. **Жодних офіційних логотипів і символів Naruto** (символ клану, плащ із логотипом), жодних растрових фонів, жодного `backdrop-filter`, жодного постійного `filter: blur`.
- `prefers-reduced-motion: reduce` — жодного руху мотивів. Анімації мотивів — лише всередині `@media (prefers-reduced-motion: no-preference)`.
- Контраст тексту ≥ WCAG AA (4.5:1) на новому тлі. Фокус видно (`:focus-visible` — обведення `--accent`, 2 px). Підказки доступні з клавіатури й дотиком.
- RTL арабської: лише логічні властивості (`styles-rtl.test.ts`), стрілки й шеврони — з `flip-rtl`.
- Меню — 5 пунктів, без переповнення й прокрутки вбік на 320–1280 px у всіх 7 мовах; на телефоні (≤ 700 px) ≤ 60 px заввишки, один рядок.
- Старі адреси `/prizes`, `/achievements`, `/friends` працюють як аліаси (рішення 2).
- **Тексти:**
  - uk — лише в `apps/web/src/i18n.ts` через `t()` / `countText()` / `errorText()`, тон «ти»;
  - кожен новий ключ — у всіх 7 мовах (uk в `i18n.ts`; en, pl, de, es, it, ar у `apps/web/src/locales/<lang>.json`). Шлях: `pnpm l10n todo <lang>` → переклад у файл у scratchpad → `pnpm l10n merge <lang> <file>`;
  - `pnpm l10n check <lang>` чисто для кожної з шести мов;
  - видалений uk-ключ видаляється й з усіх `<lang>.json` (і з `locales/reviewed/<lang>.json`, якщо він там є);
  - **ru — ніколи, ніде;**
  - кирилиці поза словниками немає (`source-scan.test.ts`).
- `apps/web/src/i18n.test.ts` («uk golden»): нові uk-ключі кожна задача дописує в масив `ADDED_23A` (створює перша задача з новими ключами й додає до перевірки поряд із `ADDED_LATER`), а видалені з golden — у `REMOVED`.
- Жодного контенту про росію (правило власника). У тестах і e2e — Україна, відповіді «так»/«ні» змішані.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e:
  - спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<шаблон>"`, **лише на передньому плані**;
  - кадри: `E2E_SHOTS=1`, `apps/server/e2e/artifacts/shots/p23a-*`;
  - частини для повного прогону: `"^part 7"`, `"^part 8"`, `"^part 9"`, `"^part 10"`, `"^part 11"`, `"^part 12"`, `"^part 1[3-9]"`, `"^part 2[0-3]"`, `"^(?!part )"`.
- Трейлер кожного коміту:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `apps/web/src/styles.css`, `apps/web/src/theme.test.ts` (новий), `apps/web/index.html`, `apps/web/public/manifest.webmanifest`, `apps/server/src/pwa.test.ts`, `screens/AuthorLobby.tsx`, `screens/StageScreen.tsx` (QR) | токени, поверхні, контраст | 1 |
| `apps/web/src/motifs/Motifs.tsx` + `Motifs.test.tsx` (нові), `pages/Home.tsx`, `pages/Login.tsx`, `ErrorBoundary.tsx`, `styles.css`, `theme.test.ts` | мотиви | 2 |
| `styles.css`, `theme.test.ts`, `pages/Play.tsx`, `pages/Host.tsx`, `pages/Stage.tsx` | гра: `--wrong`, ✗, фон | 3 |
| `menu/Menu.tsx`, `menu/Menu.test.tsx`, `i18n.ts`, `i18n.test.ts`, `locales/*.json`, `styles.css` | меню з 5 пунктів | 4 |
| `packages/shared/src/showcase.ts` + тест, `prizes.ts`, `index.ts`; `apps/server/src/db/schema.ts`, `drizzle/0030_showcase_pins.sql` + `meta`, `showcase-pins.ts` + тест, `showcase-routes.ts` + тест, `app.ts`, `prizes.ts`; фікстури `showcase` у тестах | вітрини: сервер | 5 |
| `profile/useMyProfile.ts`, `profile/ProfileSubpage.tsx`, `pages/profile/ProfileQuizzes.tsx`, `ProfileStats.tsx`, `ProfileLikes.tsx`, `ProfileLooks.tsx`, `ProfileSettings.tsx`, `pages/profile/subpages.test.tsx` (нові); `AppRoutes.tsx` + тест, `pages/Prizes.tsx`, `pages/Achievements.tsx`, `pages/Friends.tsx` + тести, `profile/PopularQuizzes.tsx`, `i18n.ts`, `locales/*.json`, `styles.css` | підсторінки й маршрути | 6 |
| `profile/ProfileHeader.tsx`, `profile/ProfileTiles.tsx` (нові) + `profile/ProfileHeader.test.tsx`; `pages/Profile.tsx` + `Profile.test.tsx`, `i18n.ts`, `locales/*.json`, `styles.css` | головна профілю | 7 |
| `api.ts`, `profile/usePins.ts`, `profile/PinButton.tsx`, `profile/ShowcaseShelf.tsx`, `profile/AchievementShowcase.tsx` (нові) + тести; `profile/Showcase.tsx`, `pages/Prizes.tsx`, `pages/Achievements.tsx`, `pages/Profile.tsx`, `i18n.ts`, `locales/*.json`, `styles.css` | вітрини: інтерфейс | 8 |
| `pages/PublicProfile.tsx` + тест, `profile/AchievementStrip.tsx` (видалити), `i18n.ts`, `locales/*.json`, `styles.css` | публічний профіль | 9 |
| `apps/server/e2e/full-game.e2e.ts` | наявні сценарії під нове меню й профіль | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій «part 23a» і візуальна перевірка | 11 |

## Порядок збирання

- Тема (спільний `styles.css`): 1 → 2 → 3.
- Меню: 4 (після 3, бо теж `styles.css`).
- Сервер: 5 (не залежить від 1–4, але ставиться після 4, щоб гілка йшла лінійно).
- Профіль: 6 → 7 → 8 → 9.
- e2e: 10 → 11.
- **Навмисні зміни наявних очікувань** (лише ці; інший червоний старий тест рецензент розбирає як регресію):
  - `pwa.test.ts`: колір маніфесту `#060505`;
  - `Menu.test.tsx`: п'ять пунктів, «Профіль» активний на аліасах;
  - тести, що порівнюють `showcase` через `toEqual` (`profiles.test.ts`, `profile-routes.test.ts`, `admin-routes.test.ts`, `prizes*.test.ts`, веб-фікстури `Profile.test.tsx`, `PublicProfile.test.tsx`, `Showcase.test.tsx`), дістають `pins: { prizes: [], achievements: [] }`;
  - `Profile.test.tsx` переписується під шапку й плитки: тести виходу, мови, адмінки, редагування ніку переїжджають у `subpages.test.tsx`;
  - `PublicProfile.test.tsx`, `Achievements.test.tsx`, `Prizes.test.tsx`, `Friends.test.tsx` — заголовки підсторінок і посилання «Назад»;
  - e2e: усі `menuLinks` і `expectEightItems18a`, селектори профілю (задача 10).

## На що дивитися рецензентові (Review Focus)

1. **Закріплена нагорода зникла чи старша за 60 найновіших.** Адмін видалив нагороду: вона зникає з `pins`, звільняє слот, і новий приз можна закріпити без «вітрина повна». Нагорода, старша за `SHOWCASE_MAX` найновіших, лишається на полиці. Тест — задача 5.
2. **Подвійний дотик або два пристрої водночас закріплюють 4-й приз.** На вітрині ніколи не більше 3 призів чи 5 ачівок: база тримає слот, клієнт блокує кнопку на час запиту. Тести — задача 5 (паралельні `pinItem`) і задача 8 (кнопка `disabled` під час запиту).
3. **Довгі підписи плиток і меню в de / pl / ar на 320 px.** «Einstellungen», «Osiągnięcia», арабські слова не вилазять за плитку й пункт, немає прокрутки вбік. Тест — задача 11 (усі 7 мов × ширини).
4. **Новий акаунт без нагород і ачівок, чужий профіль гостя.** Полиця й ачівки показують порожній стан із хмаринкою, без зламаних «усі ›» і без помилок консолі. Тести — задачі 8 і 9.
5. **Глибоке посилання без сесії.** `/profile/settings`, `/prizes`, `/achievements`, `/friends` без входу ведуть на вхід і після входу повертають на ту саму адресу. Тест — задача 6.

---

### Задача 1. Тема: токени «Кривавого місяця» й базові поверхні

**Files:**
- Create: `apps/web/src/theme.test.ts`
- Modify: `apps/web/src/styles.css`, `apps/web/index.html` (`theme-color`), `apps/web/public/manifest.webmanifest` (`background_color`, `theme_color`), `apps/server/src/pwa.test.ts`, `apps/web/src/screens/AuthorLobby.tsx`, `apps/web/src/screens/StageScreen.tsx` (QR: `bgColor="#F3EAEA" fgColor="#060505"`)

**Interfaces:**
- Produces: CSS-змінні з «Рішень» (`--stage`, `--surface`, `--line`, `--paper`, `--dim`, `--accent`, `--accent-text`, `--link`, `--on-accent`, `--amber`, `--spot`, `--panel`, `--signal`, `--wrong`, `--radius`, `--radius-small`). Наступні задачі вживають лише їх, без нових кольорів-літералів.
- Produces (`theme.test.ts`, для задач 2–3):
  ```ts
  /** Значення змінних із першого блока :root у styles.css. */
  export function rootTokens(css: string): Record<string, string>;
  /** Колір змінної: hex або rgb(r g b / a), змішаний з тлом --stage, якщо є альфа. */
  export function tokenColor(tokens: Record<string, string>, name: string): [number, number, number];
  export function contrast(a: [number, number, number], b: [number, number, number]): number;
  ```
  Читання файла — як у `styles-rtl.test.ts` (`readFileSync` з `@ts-expect-error`); експорти лишаються в тестовому файлі (задачі 2–3 дописують сюди свої `describe`).

- [ ] **Step 1: Write the failing test** `theme.test.ts`:
  - `rootTokens(css)['--stage']` = `'#060505'`, `--surface` = `'#0f0b0b'`, `--line` = `'#2a1a1a'`, `--accent` = `'#e02531'`, `--paper` = `'#f3eaea'`, `--wrong` = `'#ff8fa3'`, `--radius` = `'0.5rem'`;
  - контраст ≥ 4.5 для пар: `--paper`/`--stage`, `--paper`/`--surface`, `--dim`/`--stage`, `--dim`/`--surface`, `--accent-text`/`--stage`, `--accent-text`/`--surface`, `--link`/`--stage`, `--on-accent`/`--accent`, `--correct`/`--stage`, `--wrong`/`--stage`, `--stage`/`--accent-text` (заливки `--amber` з темним текстом);
  - `--accent`/`--stage` < 4.5 (закріплює, чому червоний текст береться з `--accent-text`);
  - у `styles.css` немає `backdrop-filter`;
  - жодного `border-radius: 0.75rem|0.875rem|1rem|0.625rem`;
  - правило `.btn-primary` містить `background: var(--accent)` і `color: var(--on-accent)`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/theme.test.ts` → FAIL.
- [ ] **Step 3: Implement:**
  - нові значення `:root`;
  - `body` — тло `--stage` і `radial-gradient(120% 60% at 50% -10%, var(--spot) 0%, transparent 60%)`;
  - `.btn-primary`;
  - радіуси за «Рішеннями»;
  - `backdrop-filter` прибрати;
  - `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`, якщо такого правила ще немає;
  - поверхні карток, полів, діалогів, адмінки, редактора — на `--surface` / `--line`.
  - Пройтися по `var(--amber)`: там, де це заливка під світлим текстом, взяти `--accent` + `--on-accent`. Інші кольорові літерали в правилах (не в `:root`) замінити змінними, крім ігрових (трофеї, команди).
  - `index.html` / маніфест / `pwa.test.ts` — `#060505`. QR — кольори вище.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web && pnpm vitest run --maxWorkers=2 apps/server/src/pwa.test.ts` → PASS (зокрема `styles-rtl.test.ts`).
- [ ] **Step 5: Візуально:** `pnpm build`, `pnpm --filter @quiz/server dev` (або як у README), відкрити `/`, `/login`, `/quizzes`, `/history` на 375 і 1280 px. Тло майже чорне, червоний лише на кнопках, активному пункті, числах.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web apps/server/src/pwa.test.ts
  git commit -m "feat(web): «Blood moon» theme tokens — near-black surfaces, red accent with an AA-safe text red, sharper corners, no glass, a faint red glow on top, and a contrast test for the palette

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. Мотиви: червоний місяць, ворони, хмаринка, кільце томое

**Files:**
- Create: `apps/web/src/motifs/Motifs.tsx`, `apps/web/src/motifs/Motifs.test.tsx`
- Modify: `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/Login.tsx`, `apps/web/src/ErrorBoundary.tsx`, `apps/web/src/styles.css`, `apps/web/src/theme.test.ts`

**Interfaces:**
- Consumes: токени задачі 1.
- Produces (`Motifs.tsx`), задачі 7–9 вживають:
  ```ts
  /** Світний місяць: div.moon.moon-{size}; hero — у шапці/героях, faint — фоном. */
  export function BloodMoon({ size = 'hero' }: { size?: 'hero' | 'faint' }): JSX.Element;
  /** 2–3 власні силуети воронів в одному svg.crows. */
  export function Crows(): JSX.Element;
  /** Хмаринка: svg.cloud-motif, заливка var(--accent), контур #fff. */
  export function AkatsukiCloud({ className }: { className?: string }): JSX.Element;
  /** span.tomoe-ring навколо children (аватар): SVG-кільце з трьома томое. */
  export function TomoeRing({ children }: { children: ReactNode }): JSX.Element;
  /** section.motif-hero: місяць і ворони позаду children (вміст поверх, z-index). */
  export function MotifHero({ children, className }: { children: ReactNode; className?: string }): JSX.Element;
  ```
  Усі декоративні вузли мають `aria-hidden="true"`, а `svg` ще й `focusable="false"`. Тексту немає, нових ключів немає.

- [ ] **Step 1: Write the failing tests**
  - `Motifs.test.tsx`:
    - `render(<MotifHero><p>Код</p></MotifHero>)` — `.moon` і `svg.crows` мають `aria-hidden="true"`, «Код» доступний через `getByText`;
    - `<TomoeRing><span>А</span></TomoeRing>` — дитина всередині, `svg` з трьома елементами `.tomoe`;
    - `<AkatsukiCloud />` — `svg.cloud-motif[aria-hidden="true"]`;
    - у `Motifs.tsx` немає `<img` і `url(` (читання файла як у source-scan).
  - `theme.test.ts`, новий `describe('motifs')`:
    - після вирізання всіх блоків `@media (prefers-reduced-motion: no-preference) { … }` (з урахуванням вкладених дужок) жодне правило з `.moon`, `.crows`, `.cloud-motif`, `.tomoe-ring` у селекторі не має `animation` чи `transition`;
    - правила `.moon` не мають `filter: blur`.
  - `Home.test.tsx`, `Login.test.tsx`: є `.motif-hero`, поле коду / форма входу доступні як раніше.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/motifs apps/web/src/theme.test.ts apps/web/src/pages/Home.test.tsx apps/web/src/pages/Login.test.tsx` → FAIL.
- [ ] **Step 3: Implement:**
  - компоненти, як у «Рішеннях»: власні SVG-шляхи, без копії арту;
  - CSS `.moon` (radial-gradient, `box-shadow: 0 0 80px rgb(179 16 26 / 0.6)`, `inset-inline-end`, `opacity` hero 0.85 / faint 0.12, `pointer-events: none`), `.crows` (`fill: #000`, дрейф 30 с лише в no-preference), `.cloud-motif`, `.tomoe-ring`, `.motif-hero` (`position: relative; overflow: hidden; isolation: isolate`);
  - Home — `MotifHero` навколо заголовка й поля коду; Login — навколо заголовка; ErrorBoundary — `AkatsukiCloud` над текстом.
  - Нічого не накладається поверх полів: вміст `z-index: 1`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): own motifs — a glowing red moon from a gradient, crow silhouettes, a red cloud with a white outline and a three-tomoe ring, all decorative, still under reduced motion, on home, sign-in and the error screen

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. Гра: телефон, сцена й ведучий — «неправильно» з ✗ і фоновий місяць

**Files:**
- Modify: `apps/web/src/styles.css`, `apps/web/src/theme.test.ts`, `apps/web/src/pages/Play.tsx`, `apps/web/src/pages/Host.tsx`, `apps/web/src/pages/Stage.tsx`, їхні тести (`Play.test.tsx`, `Host.test.tsx`, `Stage.test.tsx`)

**Interfaces:**
- Consumes: `--wrong`, `--correct`, `--accent` (задача 1); клас `.moon` (задача 2) не вживається, фон — чистий CSS.
- Produces: клас `game-bg` на кожному `<main>` сторінок Play, Host, Stage (разом з наявними `app narrow` / `app stage`).

- [ ] **Step 1: Write the failing tests**
  - `theme.test.ts`, `describe('game verdicts')`:
    - кожне правило, чий селектор містить `.is-wrong` і яке задає `color`, `background` чи `border-color`, вживає `var(--wrong)` і не вживає `var(--signal)`, `var(--accent)`, `var(--amber)`, `var(--accent-text)`. Виняток — `.tag.is-wrong`, де дозволено `var(--wrong)` і нейтральні;
    - є правила `.choice.is-wrong::after`, `.spotlight-answer.is-wrong::after`, `.duel-stage-answer.is-wrong::after`, `.result.is-wrong h2::before`, і кожне має `content: '✗' / ''`;
    - `.game-bg::before` має `pointer-events: none` і `opacity` ≤ 0.12, без `animation`.
  - `Play.test.tsx`, `Host.test.tsx`, `Stage.test.tsx` — по одному тесту: `<main>` має клас `game-bg`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/theme.test.ts apps/web/src/pages/Play.test.tsx apps/web/src/pages/Host.test.tsx apps/web/src/pages/Stage.test.tsx` → FAIL.
- [ ] **Step 3: Implement:**
  - `--signal` → `--wrong` у всіх `.is-wrong` (зокрема `verdict-blink`);
  - ✗ на елементах зі списку: місце — `inset-inline-end`, а не поверх тексту варіанта; на `.choice` додати відступ `padding-inline-end`, щоб ✗ не налазив на довгий текст;
  - `.game-bg { position: relative; isolation: isolate }`, `.game-bg::before` — слабкий місяць у куті `inset-inline-end`, `z-index: -1`;
  - на сцені запитання й варіанти читаються не гірше, ніж до задачі: розмір шрифту той самий, тло карток `--surface`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS (зокрема `verdict-blink.test.ts`, `PlayerScreen.test.tsx`, `StageScreen.test.tsx`).
- [ ] **Step 5: Візуально:** `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 7a"` (або інша класична частина, де гравець відповідає неправильно). У кадрах телефона й сцени ✗ видно, «неправильно» не схоже на червону кнопку, запитання читається.
- [ ] **Step 6: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): game screens in the new theme — a wrong answer gets its own rose tone and a ✗ mark on the phone, the stage and the host so it never reads as the red accent, and a faint moon sits behind the game

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. Меню з п'яти пунктів

**Files:**
- Modify: `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`, `apps/web/src/locales/reviewed/*.json` (якщо там є видалені ключі), `apps/web/src/styles.css`

**Interfaces:**
- Produces: для увійденого меню `[JOIN, FEED, QUIZZES, HISTORY, PROFILE]`. `PROFILE.active(path)` = `true` для `/profile`, `/profile/…`, `/prizes…`, `/achievements…`, `/friends…`. Анонім — `[JOIN, signIn]`, як було.

- [ ] **Step 1: Write the failing test** `Menu.test.tsx` (оновити наявні):
  - увійдений бачить рівно `['Приєднатися', 'Стрічка', 'Мої вікторини', 'Історія', 'Профіль']`;
  - «Профіль» має `aria-current="page"` на `/profile/prizes`, `/prizes`, `/achievements`, `/friends`, `/profile/u2`, `/profile/u2/achievements`;
  - посилань на `/prizes`, `/achievements`, `/friends` у меню немає;
  - бейдж запрошень на «Профілі» і бейдж «Стрічки» — як раніше;
  - тести «prizes / achievements / friends are marked on their page» замінено тестом аліасів вище.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/menu` → FAIL.
- [ ] **Step 3: Implement:**
  - прибрати `PRIZES_ITEM`, `ACHIEVEMENTS_ITEM`, `FRIENDS`;
  - активність «Профілю»;
  - мобільний `.menu a` — `font-size: clamp(0.6875rem, 3.2vw, 0.8125rem)`, коментар про вісім пунктів оновити;
  - активний пункт — `color: var(--accent-text)` і смужка `--accent` (`border-block-start` на телефоні, `border-block-end` на десктопі);
  - тло меню `--stage`, рамка `--line`;
  - видалити шість ключів меню з `i18n.ts` і з шести JSON. Ті, що є в `__fixtures__/uk-golden.json`, дописати в `REMOVED` у `i18n.test.ts`; `menuFriends` і `menuShortFriends` прибрати з `ADDED_LATER`;
  - `pnpm l10n check <lang>` ×6.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` і `for l in en pl de es it ar; do pnpm l10n check $l; done` → PASS / чисто.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): five menu items — join, feed, quizzes, history and profile; prizes, achievements and friends move into the profile, which stays marked on their old addresses, and the invite badge stays on the profile

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. Вітрини на сервері: таблиця, сховище, маршрути, спільні типи

**Files:**
- Create: `packages/shared/src/showcase.ts`, `packages/shared/src/showcase.test.ts`, `apps/server/drizzle/0030_showcase_pins.sql` (через drizzle-kit), `apps/server/drizzle/meta/0030_snapshot.json`, `apps/server/src/showcase-pins.ts`, `apps/server/src/showcase-pins.test.ts`, `apps/server/src/showcase-routes.ts`, `apps/server/src/showcase-routes.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/prizes.ts` (`Showcase.pins`), `apps/server/src/db/schema.ts`, `apps/server/drizzle/meta/_journal.json`, `apps/server/src/app.ts`, `apps/server/src/prizes.ts` (`showcaseOf`, `deleteAward`); фікстури з `showcase: {…}` у `apps/server/src/*.test.ts`, `apps/web/src/pages/Profile.test.tsx`, `apps/web/src/pages/PublicProfile.test.tsx`, `apps/web/src/profile/Showcase.test.tsx`

**Interfaces:**
- Produces (`packages/shared/src/showcase.ts`):
  ```ts
  export const SHOWCASE_PIN_LIMITS = { prize: 3, achievement: 5 } as const;
  export const SHOWCASE_PIN_KINDS = ['prize', 'achievement'] as const;
  export type ShowcasePinKind = (typeof SHOWCASE_PIN_KINDS)[number];
  export type ShowcasePin = { kind: 'prize'; id: string } | { kind: 'achievement'; id: AchievementId };
  /** discriminatedUnion за kind; prize.id — uuid; achievement.id — z.enum(ACHIEVEMENTS); strict. */
  export const showcasePinSchema: z.ZodType<ShowcasePin>;
  export interface ShowcasePins { prizes: string[]; achievements: AchievementId[] }
  export const EMPTY_PINS: ShowcasePins; // { prizes: [], achievements: [] }
  /** Полиця: закріплені (у їхньому порядку, лише наявні) або автовибір; не більше SHOWCASE_PIN_LIMITS.prize. */
  export function shelfAwards(awards: AwardCard[], pinned: string[]): AwardCard[];
  /** Ачівки профілю: закріплені отримані в порядку закріплення або найновіші отримані; не більше 5. */
  export function shelfAchievements(achievements: Achievement[], pinned: AchievementId[]): Achievement[];
  /** Порядок показу на полиці: 3 → [b, a, c] (перший у центрі); інакше як є. */
  export function shelfColumns<T>(items: T[]): T[];
  ```
- Modify (`prizes.ts` shared): `export interface Showcase { title: …; awards: AwardCard[]; pins: ShowcasePins }`.
- Produces (`apps/server/src/db/schema.ts`):
  ```ts
  export const showcasePin = pgTable('showcase_pin', {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ShowcasePinKind>().notNull(),
    itemId: text('item_id').notNull(),
    slot: integer('slot').notNull(),
    pinnedAt: at('pinned_at').notNull(),
  }, (table) => [primaryKey({ columns: [table.userId, table.kind, table.itemId] }), uniqueIndex('showcase_pin_slot').on(table.userId, table.kind, table.slot)]);
  ```
- Produces (`apps/server/src/showcase-pins.ts`):
  ```ts
  /** Закріплене людини: порядок pinned_at, потім slot; лише наявні нагороди (prize_award цього userId) та отримані ачівки (user_achievement). */
  export async function showcasePins(db: Db | Tx, userId: string): Promise<ShowcasePins>;
  export type PinResult = { ok: true; pins: ShowcasePins } | { ok: false; error: 'not_found' | 'showcase_full' };
  /** У транзакції: перевірка власності → повтор = ok без змін → прибрати застарілі → ліміт → найменший вільний slot; 23505 на slot → showcase_full. */
  export async function pinItem(db: Db, userId: string, pin: ShowcasePin, now?: Date): Promise<PinResult>;
  /** Ідемпотентно. */
  export async function unpinItem(db: Db, userId: string, pin: ShowcasePin): Promise<ShowcasePins>;
  ```
- Produces (`showcase-routes.ts`): `registerShowcaseRoutes(app, { db, currentUser }): Promise<void>` — маршрути з «Рішень».
- Modify (`apps/server/src/prizes.ts`):
  - `showcaseOf` повертає `pins: await showcasePins(db, userId)` і дочитує закріплені нагороди, яких немає серед `SHOWCASE_MAX` найновіших (додати в кінець `awards`);
  - `deleteAward` у тій самій `db | tx` видаляє `showcase_pin` з `kind = 'prize'` і `item_id = awardId`.

- [ ] **Step 1: Write the failing tests**
  - `showcase.test.ts`:
    - `showcasePinSchema` приймає `{ kind: 'prize', id: <uuid> }` і `{ kind: 'achievement', id: 'sniper' }`; відхиляє `id: 'x'` для prize, `'nope'` для achievement, зайвий ключ, `kind: 'title'`;
    - `shelfAwards`, автовибір: нагороди A (диплом без трофея, найновіша), B (кубок, старіша), C (медаль, найстаріша), D (лише `real`) → `[B, C, A]`;
    - `shelfAwards` з `pinned` `[C.id, 'зниклий', A.id]` → `[C, A]`;
    - `shelfAchievements`: отримані `sniper` (2026-10-01), `host` (2026-10-20), `first_game` (`earnedAt: null`), неотримана `veteran` → `['host', 'sniper', 'first_game']`; з `pinned` `['first_game', 'veteran']` → `['first_game']`; із 7 отриманих автовибір дає 5;
    - `shelfColumns(['a','b','c'])` → `['b','a','c']`; `shelfColumns(['a','b'])` → `['a','b']`.
  - `showcase-pins.test.ts` (PGlite, `createTestDb`; нагороди — прямою вставкою в `prizeAward`, ачівки — у `userAchievement`):
    - закріпити 3 нагороди → `pins.prizes` у порядку закріплення; 4-та → `{ ok: false, error: 'showcase_full' }`;
    - чужа нагорода й неотримана ачівка → `not_found`;
    - повтор того самого → ok, порядок не змінився;
    - `unpinItem` середньої → лишилися дві; нова стає третьою (останньою);
    - `deleteAward` закріпленої → `showcasePins` без неї, і нову можна закріпити (слот вільний);
    - застарілий рядок, вставлений напряму (нагороди немає), не заважає закріпити 3 наявні;
    - `Promise.all` з чотирьох `pinItem` різних нагород → рівно 3 ok, 1 `showcase_full`, у базі 3 рядки;
    - ліміт ачівок 5, 6-та → `showcase_full`;
    - `showcaseOf`: закріплена нагорода, старша за 60 новіших (61 вставка), є в `awards` і в `pins.prizes`.
  - `showcase-routes.test.ts` (`buildApp`, `signUp`):
    - без cookie GET/POST/DELETE → 401;
    - POST невалідного тіла → 400 `invalid_payload`;
    - POST чужої нагороди → 404 `not_found`; 4-та → 409 `showcase_full`;
    - DELETE `/api/me/showcase/pins/title/x` → 404; DELETE закріпленої → 200 з новим списком;
    - `GET /api/profiles/<id>` іншою людиною → `showcase.pins` = закріплене власника, а `Object.keys(body)` не змінився.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/showcase.test.ts apps/server/src/showcase-pins.test.ts apps/server/src/showcase-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement:**
  - shared → `schema.ts` → `pnpm --filter @quiz/server exec drizzle-kit generate --name showcase_pins` (SQL: `CREATE TABLE "showcase_pin"` + FK + PK + унікальний індекс; більше нічого);
  - сховище, маршрути, реєстрація в `app.ts` після `registerPrizeRoutes`;
  - `showcaseOf` / `deleteAward`;
  - фікстури `showcase` дописати `pins: EMPTY_PINS` (чи літерал).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/server apps/web/src
  git commit -m "feat(server): showcase pins — up to 3 won prizes and 5 earned achievements per player in order of pinning, checked for ownership and the limit in the database, cleaned when an award is deleted, served in the showcase of own and public profiles

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Профіль: підсторінки плиток, маршрути й аліаси

**Files:**
- Create: `apps/web/src/profile/useMyProfile.ts`, `apps/web/src/profile/ProfileSubpage.tsx`, `apps/web/src/pages/profile/ProfileQuizzes.tsx`, `ProfileStats.tsx`, `ProfileLikes.tsx`, `ProfileLooks.tsx`, `ProfileSettings.tsx`, `apps/web/src/pages/profile/subpages.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx`, `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/pages/Prizes.tsx` + тест, `apps/web/src/pages/Achievements.tsx` + тест, `apps/web/src/pages/Friends.tsx` + тест, `apps/web/src/profile/PopularQuizzes.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/*.json`, `apps/web/src/styles.css`

**Interfaces:**
- Produces:
  ```ts
  // profile/useMyProfile.ts — getMyProfile через usePrivateData; під час перезавантаження лишає останні готові дані (як зараз у Profile.tsx).
  export function useMyProfile(): { state: PrivateData<OwnProfile>; reload: () => void };
  // profile/ProfileSubpage.tsx
  export function loginFor(pathname: string): string; // `/login?next=${encodeURIComponent(pathname)}`
  /** main.app.wide.profile-sub: рядок «‹» (Link на back, aria-label t('profileBack'), шеврон .flip-rtl) + h1.brand title. */
  export function ProfileSubpage({ title, back, className, children }: { title: ReactNode; back?: string; className?: string; children: ReactNode }): JSX.Element;
  /** Спільні стани: signed-out → Navigate на loginFor(location.pathname); loading → t('loading'); error → p.error[role=alert]; ready → children(data). */
  export function SubpageData<T>({ state, title, children }: { state: PrivateData<T>; title: string; children: (data: T) => ReactNode }): JSX.Element;
  // profile/PopularQuizzes.tsx — без «Ще N»:
  export function PopularQuizzes({ quizzes, limit }: { quizzes: OwnProfile['quizzes']; limit?: number }): JSX.Element; // кожен рядок: назва + `${plays} ${countText('statGames', plays)}`
  ```
- Сторінки (`pages/profile/*.tsx`), кожна в `ProfileSubpage` з заголовком-плиткою:
  - `ProfileQuizzes` — `PopularQuizzes` без ліміту;
  - `ProfileStats` — `StatsView` + розділ `winsTitle` зі списком перемог (перенести з `Profile.tsx`);
  - `ProfileLikes` — `LikesCard`;
  - `ProfileLooks` — `LevelCard` (нагороди рівнів + вибір вигляду, `onSaved` → `reload`);
  - `ProfileSettings` — рядки: «Нікнейм і аватар» (кнопка відкриває `ProfileEditor`; відкритий одразу при `?edit=1`), `LanguageSwitcher signedIn`, `PushSettings`, посилання `publicProfileLink` на `/profile/<id>`, «Адмінка» лише для `account.admin`, «Пошта» (лише показ `profile.email`), кнопка «Вийти» з логікою `leave` із `Profile.tsx` (`disablePush` з межею 3 с, `signOut`, `navigate('/')`).
- `Prizes.tsx`: `ProfileSubpage` з `t('profileTilePrizes')`; розділи `h2` `showcaseTitle` (наявний `Showcase` з виграними з `useMyProfile`, порожньо — `t('noAwardsYet')`) і `h2` `prizesTitle` (склад, як зараз). Вхід — `loginFor(location.pathname)`.
- `Achievements.tsx`: свої — у `ProfileSubpage` з `t('profileTileAchievements')`; чужі — `back={`/profile/${id}`}` з наявним заголовком «Ачівки: Оля».
- `Friends.tsx`: `ProfileSubpage` з `t('profileTileFriends')`.
- `AppRoutes.tsx`: вісім `/profile/<розділ>`; `/prizes`, `/achievements`, `/friends` — ті самі елементи.
- **Нові uk-ключі** (у `ADDED_23A`, переклад ×6):

  | ключ | uk |
  |---|---|
  | `profileBack` | `Назад` |
  | `profileTileQuizzes` | `Вікторини` |
  | `profileTilePrizes` | `Призи` |
  | `profileTileAchievements` | `Досягнення` |
  | `profileTileFriends` | `Друзі` |
  | `profileTileStats` | `Статистика` |
  | `profileTileLikes` | `Вподобання` |
  | `profileTileLooks` | `Вигляд` |
  | `profileTileSettings` | `Налаштування` |
  | `settingsNickAvatar` | `Нікнейм і аватар` |
  | `settingsEmail` | `Пошта` |
  | `noAwardsYet` | `Нагород поки немає — їх вручають у іграх із призами.` |

- [ ] **Step 1: Write the failing tests** `subpages.test.tsx` (моки `api` як у `Profile.test.tsx`, `MemoryRouter` + `AppRoutes`):
  - кожна з восьми адрес `/profile/<розділ>` показує `h1` з назвою плитки і посилання «Назад» на `/profile`;
  - `/prizes`, `/achievements`, `/friends` — ті самі заголовки (аліаси);
  - без входу `/profile/settings` → шлях `/login`, `next=%2Fprofile%2Fsettings`; `/prizes` → `next=%2Fprizes`;
  - «Налаштування»:
    - пошта видна;
    - «Вийти» кличе `disablePush`, потім `signOut` і веде на `/` (три наявні тести виходу перенести сюди);
    - «Адмінка» лише для `admin: true`;
    - мова є;
    - `?edit=1` відкриває форму ніку, збереження кличе `saveMyProfile`;
  - «Вікторини» — усі 5 вікторин і «2 гри» біля першої;
  - «Статистика» — п'єдестал і перемоги;
  - «Вигляд» — розділ нагород рівнів;
  - `/profile/u2/achievements` — «Назад» веде на `/profile/u2`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/profile` → FAIL.
- [ ] **Step 3: Implement.** Стиль `.profile-sub` і рядка «Назад»: кругла кнопка 2.25 rem, рамка `--line`, ≥ 44 px зона дотику. Розділи — картки `--surface`. Ключі ×7 мов, `pnpm l10n check` ×6.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` і `for l in en pl de es it ar; do pnpm l10n check $l; done` → PASS / чисто.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): profile sub-pages — quizzes, prizes with won awards and the store, achievements, friends, stats with wins, likes, looks and settings each on its own address with a back link, and /prizes, /achievements and /friends stay as aliases

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Головна профілю: шапка, чотири числа, сітка плиток

**Files:**
- Create: `apps/web/src/profile/ProfileHeader.tsx`, `apps/web/src/profile/ProfileTiles.tsx`, `apps/web/src/profile/ProfileHeader.test.tsx`
- Modify: `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/Profile.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/*.json`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `useMyProfile`, `PopularQuizzes` (задача 6); `MotifHero`, `TomoeRing` (задача 2); `ProfileLevelMark`, `LevelBar` (`LevelCard.tsx`); `Avatar`.
- Produces (задача 9 вживає ту саму шапку):
  ```ts
  /** Чотири числа: ігор, перемог, влучність, проведено. dl.headline-stats. */
  export function HeadlineStats({ stats }: { stats: ProfileStats }): JSX.Element;
  /** header.profile-head у MotifHero: аватар у TomoeRing (рамка --accent), h1 нік + ProfileLevelMark + nick-title,
   *  плашка «🏆 N перемог», editTo → посилання t('editProfile') (наявний ключ «Змінити нікнейм / аватар»), progress → LevelBar, HeadlineStats, children (дії). */
  export function ProfileHeader(props: {
    profile: ProfileCard; level: number; badge: string | null; title: string | null; stats: ProfileStats;
    progress?: OwnLevel['progress']; editTo?: string; children?: ReactNode;
  }): JSX.Element;
  /** nav.profile-tiles (aria-label t('profileTilesLabel')): 8 Link-плиток у порядку специфікації; число — span.tile-count, ім'я посилання «Вікторини, 23». */
  export function ProfileTiles({ counts }: { counts: { quizzes: number; prizes: number; achievements: number } }): JSX.Element;
  ```
- `Profile.tsx`:
  - `ProfileHeader` з `editTo="/profile/settings?edit=1"`, `progress={profile.level.progress}`;
  - `InviteList` (як зараз, під шапкою);
  - `ProfileTiles`;
  - місце під вітрини задачі 8 — коментар-позначка;
  - розділ `profilePopularTitle` з `PopularQuizzes limit={3}` і `Link` `profileSeeAll ›` на `/profile/quizzes`.
  - Більше нічого: статистика, вподобання, вигляд, нагороди, перемоги, мова, сповіщення, адмінка, вихід — на підсторінках.
- Нові uk-ключі (посилання редагування — наявний `editProfile`): `profileTilesLabel` — `Розділи профілю`; `profilePopularTitle` — `Найпопулярніші вікторини`; `profileSeeAll` — `усі`. Ключі, що стали невживаними (`profileQuizzesMore`, `myQuizzesTitle` тощо — перевірити `grep`), видалити з `i18n.ts` і шести JSON; ті, що є в golden, — у `REMOVED`.

- [ ] **Step 1: Write the failing tests**
  - `ProfileHeader.test.tsx`:
    - нік у `h1`; «Рів. 7» є;
    - `🏆 3 перемоги` (wins 3); `🏆 5 перемог` (wins 5);
    - чотири `dd` у `.headline-stats` = `['48', '17', '72%', '16']` для `{ games: 48, wins: 17, accuracy: 72, hosted: 16 }`; `accuracy: null` → `–`;
    - без `editTo` посилання «Змінити нікнейм / аватар» немає, з ним — веде на `/profile/settings?edit=1`;
    - `.moon` і `.tomoe-ring` у шапці є.
  - `Profile.test.tsx` (переписати):
    - порядок блоків: шапка → запрошення (якщо є) → `nav` «Розділи профілю» → «Найпопулярніші вікторини»;
    - вісім плиток з href `/profile/quizzes`, `/profile/prizes`, `/profile/achievements`, `/profile/friends`, `/profile/stats`, `/profile/likes`, `/profile/looks`, `/profile/settings`;
    - плитки «Вікторини, 5», «Призи, 2», «Досягнення, 1» з фікстури;
    - топ-3 вікторини з «N ігор» і «усі» → `/profile/quizzes`;
    - на сторінці немає «Вийти», пошти, мови;
    - запрошення: тести «shows invites at the top…» лишаються;
    - вхід: `/login?next=%2Fprofile`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile/ProfileHeader.test.tsx apps/web/src/pages/Profile.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, вигляд як у `profile-structure.html`:
  - плитки — сітка `repeat(4, 1fr)` з `gap: 0.5rem`, тло `--surface`, рамка `--line`, `--radius`, емодзі 1.5rem, підпис 0.6875rem з `overflow-wrap: anywhere; hyphens: auto`, число `inset-inline-end`, колір `--link`;
  - ≥ 960 px — дві колонки за «Рішеннями»;
  - ключі ×7, `l10n check` ×6.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` і `for l in en pl de es it ar; do pnpm l10n check $l; done` → PASS / чисто.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the profile becomes a header and tiles — avatar in a tomoe ring under the red moon, level and wins pills, the level bar, four headline numbers, eight tiles with counts, and the three most played quizzes with «all»

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 8. Вітрини в інтерфейсі: кнопки 📌, полиця кубків і ачівки на профілі

**Files:**
- Create: `apps/web/src/profile/usePins.ts`, `apps/web/src/profile/usePins.test.tsx`, `apps/web/src/profile/PinButton.tsx`, `apps/web/src/profile/ShowcaseShelf.tsx`, `apps/web/src/profile/ShowcaseShelf.test.tsx`, `apps/web/src/profile/AchievementShowcase.tsx`, `apps/web/src/profile/AchievementShowcase.test.tsx`
- Modify: `apps/web/src/api.ts`, `apps/web/src/profile/Showcase.tsx`, `apps/web/src/pages/Prizes.tsx` + тест, `apps/web/src/pages/Achievements.tsx` + тест, `apps/web/src/pages/Profile.tsx` + тест, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/*.json`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `ShowcasePin`, `ShowcasePins`, `SHOWCASE_PIN_LIMITS`, `shelfAwards`, `shelfAchievements`, `shelfColumns` (задача 5); `AkatsukiCloud` (задача 2); `PrizeViewer`, `canViewPrize`, `renderDiploma`/`shareDiploma`, `TROPHY_EMOJI`, `trophyLabel`.
- Produces:
  ```ts
  // api.ts
  export const getShowcasePins = () => fetchData<ShowcasePins>('/api/me/showcase/pins');
  export const pinToShowcase = (pin: ShowcasePin) => fetchData<ShowcasePins>('/api/me/showcase/pins', { body: pin });
  export const unpinFromShowcase = (pin: ShowcasePin) =>
    fetchData<ShowcasePins>(`/api/me/showcase/pins/${pin.kind}/${encodeURIComponent(pin.id)}`, { method: 'DELETE' });
  // profile/usePins.ts — initial є → без GET; немає → GET. Ліміт перевіряється до запиту; 409 showcase_full — той самий текст; інше — errorText.
  export function usePins(initial?: ShowcasePins): {
    pins: ShowcasePins | null; busy: boolean; message: string | null;
    isPinned: (pin: ShowcasePin) => boolean; toggle: (pin: ShowcasePin) => Promise<void>;
  };
  // profile/PinButton.tsx — button.btn.btn-small, aria-pressed, текст `📌 ${t(pinned ? 'pinRemove' : 'pinAdd')}`, aria-label `${текст}: ${name}`, disabled під час busy.
  export function PinButton({ pinned, busy, name, onClick }: { pinned: boolean; busy: boolean; name: string; onClick: () => void }): JSX.Element;
  // profile/ShowcaseShelf.tsx — section.shelf: h2 «🏆 Вітрина кубків» + (allTo → Link «усі призи ›» | onAll → button із allLabel); shelfColumns(shelfAwards(...)); перший — .is-main; порожньо — AkatsukiCloud + t('shelfEmpty').
  export function ShowcaseShelf(props: { awards: AwardCard[]; pinned: string[]; allTo?: string; onAll?: () => void; allLabel?: string }): JSX.Element;
  // profile/AchievementShowcase.tsx — section.achievement-showcase: h2 t('achievementShelfTitle', {earned, total: ACHIEVEMENTS.length}) + Link «усі ›» на allTo; до 5 button-квадратиків (title = назва), вибраний — підпис p[aria-live=polite]; порожньо — AkatsukiCloud + t('achievementsNone').
  export function AchievementShowcase(props: { achievements: Achievement[]; pinned: AchievementId[]; allTo: string }): JSX.Element;
  // profile/Showcase.tsx — новий необов'язковий проп:
  export function Showcase(props: { showcase: ShowcaseData; own: boolean; renderPin?: (award: AwardCard) => ReactNode }): JSX.Element | null;
  ```
- Вбудовування:
  - `Prizes.tsx`: розділ «Нагороди» — `Showcase renderPin` з `usePins(profile.showcase.pins)`; повідомлення `message` — `p[role=status]` над сіткою;
  - `Achievements.tsx` (лише свої): `usePins()`, `PinButton` на кожній отриманій картці;
  - `Profile.tsx`: після плиток — `ShowcaseShelf allTo="/profile/prizes"` і `AchievementShowcase allTo="/profile/achievements"` з `profile.showcase.pins`.
- Нові uk-ключі:

  | ключ | uk |
  |---|---|
  | `shelfTitle` | `Вітрина кубків` |
  | `shelfAll` | `усі призи` |
  | `shelfEmpty` | `Полиця поки порожня — тут стануть твої кубки.` |
  | `achievementShelfTitle` | `Ачівки · {earned} з {total}` |
  | `pinAdd` | `На вітрину` |
  | `pinRemove` | `Прибрати з вітрини` |
  | `pinFullPrizes` | `На вітрині вже {n} кубки — спершу прибери один.` |
  | `pinFullAchievements` | `На вітрині вже {n} ачівок — спершу прибери одну.` |

  `{n}` — завжди `SHOWCASE_PIN_LIMITS.prize` / `.achievement`.

- [ ] **Step 1: Write the failing tests**
  - `usePins.test.tsx` (мок `api`):
    - з `initial` GET не кличеться;
    - `toggle` незакріпленого → `pinToShowcase`, `pins` оновлено;
    - закріпленого → `unpinFromShowcase`;
    - при 3 закріплених призах `toggle` четвертого не кличе API, `message` = «На вітрині вже 3 кубки — спершу прибери один.»;
    - відповідь `{ ok: false, error: 'showcase_full' }` дає той самий текст;
    - поки запит триває, `busy === true` і другий `toggle` ігнорується.
  - `ShowcaseShelf.test.tsx`:
    - 3 авто-нагороди → у DOM порядок `[2-га, 1-ша, 3-тя]`, `.is-main` у 1-ї;
    - дотик кубка відкриває `PrizeViewer` (мок `loadViewer` як у `Showcase.test.tsx`);
    - нагорода лише з `real` — не кнопка;
    - порожньо — `.cloud-motif` і «Полиця поки порожня…», посилання «усі призи» є;
    - `onAll` → кнопка з `allLabel`.
  - `AchievementShowcase.test.tsx`:
    - заголовок «Ачівки · 7 з 48»;
    - закріплені `['host', 'sniper']` → два квадрати в цьому порядку;
    - дотик першого → підпис «За пультом» (`t('achievement_host')`) у `aria-live`;
    - без отриманих — «Ще жодного досягнення» (`achievementsNone`) і хмаринка.
  - `Prizes.test.tsx`: на виграній нагороді кнопка «📌 На вітрину» (`aria-pressed="false"`), натискання кличе `pinToShowcase({ kind: 'prize', id })` і робить її «Прибрати з вітрини».
  - `Achievements.test.tsx`: кнопка 📌 лише на отриманих і лише на своїй сторінці.
  - `Profile.test.tsx`: після плиток — «Вітрина кубків» і «Ачівки · N з M»; «усі призи» → `/profile/prizes`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile apps/web/src/pages/Prizes.test.tsx apps/web/src/pages/Achievements.test.tsx apps/web/src/pages/Profile.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, вигляд як у `profile-showcase.html`:
  - полиця: висота ~7.5rem, підставка-градієнт `--line` → `--surface`, центр 3.75rem, боки 2.875rem;
  - квадратики — `aspect-ratio: 1`, `--surface`, `--line`, `--radius`, ≥ 44 px;
  - ключі ×7, `l10n check` ×6.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` і `for l in en pl de es it ar; do pnpm l10n check $l; done` → PASS / чисто.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): showcases the player picks — «📌 to the showcase» on won prizes and earned achievements with a clear limit message, a three-cup shelf with the first in the middle that opens the full-screen viewer, and five achievement squares with captions on tap

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 9. Публічний профіль у новому стилі

**Files:**
- Modify: `apps/web/src/pages/PublicProfile.tsx`, `apps/web/src/pages/PublicProfile.test.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/*.json`, `apps/web/src/styles.css`
- Delete: `apps/web/src/profile/AchievementStrip.tsx` (якщо після задачі нічого його не імпортує; тоді й `.achievement-strip*` у CSS)

**Interfaces:**
- Consumes: `ProfileHeader`, `HeadlineStats` (задача 7); `ShowcaseShelf`, `AchievementShowcase` (задача 8); `Showcase`, `LikesCard`, `StatsView`, `VersusBlock`.
- `PublicProfile.tsx`, порядок:
  1. `ProfileHeader` (`level={profile.level.level}`, `badge={profile.level.looks.badge}`, `title={profile.showcase.title?.text ?? null}`, без `editTo` / `progress`); у `children` — дії дружби, «це ти», «увійди, щоб додати», помилка, як зараз. `emailHidden` прибрати з шапки (рядок «пошта прихована» не потрібен) і з ключів, якщо ніде більше не вживається;
  2. `ShowcaseShelf` з `onAll` (лише якщо нагород більше, ніж на полиці), що розгортає під полицею наявний `Showcase own={isOwner}`; підпис кнопки — `publicAwardsAll` / `publicAwardsHide`;
  3. `AchievementShowcase allTo={`/profile/${id}/achievements`}`;
  4. `LikesCard`;
  5. розділ `statsTitle` зі `StatsView`;
  6. `VersusBlock` (увійдений і не власник).
  - Плиток немає.
- Нові uk-ключі: `publicAwardsAll` — `Усі нагороди ({n})`; `publicAwardsHide` — `Сховати нагороди`.

- [ ] **Step 1: Write the failing test** `PublicProfile.test.tsx` (оновити):
  - шапка з тими самими чотирма числами, що й на власному профілі (ті самі `dd`);
  - `.profile-tiles` немає;
  - полиця показує закріплені власником нагороди (`showcase.pins.prizes`) у порядку `shelfColumns`;
  - «Усі нагороди (5)» розгортає 5 карток `.award-card`, друге натискання ховає;
  - з 3 нагородами або менше кнопки немає;
  - ачівки — закріплені власником; «усі» → `/profile/u2/achievements`;
  - гість без нагород і ачівок — дві хмаринки, без помилок;
  - кнопки «Додати в друзі» / «Прибрати» працюють, як у наявних тестах.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/PublicProfile.test.tsx` → FAIL.
- [ ] **Step 3: Implement**; ключі ×7, `l10n check` ×6; видалити `AchievementStrip`, якщо більше не вживається.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` і `for l in en pl de es it ar; do pnpm l10n check $l; done` → PASS / чисто.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the public profile in the new style — the same header and four numbers, the owner's pinned shelf with all awards one tap away, pinned achievements, likes, public stats and versus, and no private tiles

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 10. e2e: наявні сценарії під нове меню й профіль

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: вигляд і маршрути задач 4–9.
- Produces (помічники файла, задача 11 вживає):
  ```ts
  const MENU_ITEMS_23A = ['Приєднатися', 'Стрічка', 'Мої вікторини', 'Історія', 'Профіль'];
  /** П'ять пунктів на ширині width: count 5; ≤ 700 px — висота ≤ 60 і один рядок; без прокрутки вбік; жоден підпис не ширший за пункт. Замінює expectEightItems18a. */
  async function expectFiveItems(page: Page, width: number): Promise<void>;
  /** З будь-якої сторінки: меню «Профіль» → плитка з ім'ям name → чекає h1 name. */
  async function openProfileTile(page: Page, name: string): Promise<void>;
  ```
- Що змінюється (лише ці місця; логіку сценаріїв не чіпати):
  - кожне `toEqual([... 'Призи', 'Досягнення', 'Друзі', 'Профіль'])` та `MENU_ITEMS` → `MENU_ITEMS_23A`; `expectEightItems18a` → `expectFiveItems`; `MENU_FITS_14A` — очікувана кількість 5;
  - кліки меню «Призи» / «Досягнення» / «Друзі» (`menuProfileFriends`, 12h, 14a тощо) → `openProfileTile(page, 'Призи' | 'Досягнення' | 'Друзі')`;
  - редагування ніку й аватара з профілю → `/profile/settings` (кнопка «Нікнейм і аватар»);
  - «Вийти», мова (22a), сповіщення (20a), «Адмінка» (21a) → на `/profile/settings`;
  - статистика й п'єдестал (11f) → `/profile/stats`;
  - `section.level-card` / нагороди рівнів (15a, 16b) → `/profile/looks`; `section.level-bar` лишається на `/profile`;
  - вітрина 14a: `section.showcase` «Нагороди» — тепер на `/profile/prizes`, а на `/profile` — полиця `section.shelf`;
  - смуга ачівок 12h: `.achievement-strip` → `.achievement-showcase` (квадрати), «усі» → `/profile/achievements`;
  - назви сценаріїв, що кажуть «eight-item menu» / «keeps eight items», → «five-item menu» / «keeps five items».
- [ ] **Step 1: Знайти місця:** `grep -n "menuLinks\|expectEightItems18a\|MENU_ITEMS\|MENU_FITS_14A\|'Призи'\|'Досягнення'\|'Друзі'\|achievement-strip\|section.showcase\|level-card\|'Вийти'\|Змінити\|statsTitle\|eight" apps/server/e2e/full-game.e2e.ts`.
- [ ] **Step 2: Змінити** за списком вище.
- [ ] **Step 3: Run** `pnpm build`, потім на передньому плані, по черзі: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<шаблон>"` для кожного шаблону з «Глобальних обмежень» → усі PASS. Упалий сценарій розібрати: регресія застосунку → виправити в коді й дописати юніт-тест у відповідну задачу-файл; інакше селектор.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test(e2e): existing scenarios follow the five-item menu and the tiled profile — prizes, achievements and friends open from profile tiles, settings, stats and looks have their own pages, the shelf replaces the showcase on the profile

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 11. Наскрізний сценарій «part 23a» і візуальна перевірка

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: `expectFiveItems`, `openProfileTile`, `MENU_ITEMS_23A` (задача 10); помічники файла `open`, `register`, `myId`, `menuLinks`, `noSideScroll`, `shot`, `snapshot`, `click`, `exact`, `makeRoundsQuiz`, `classicRound`, `db`, `problems`; `prizeAward`, `userAchievement` (`schema.ts`); `deleteAward` (`apps/server/src/prizes.ts`); `LOCALES` (`@quiz/shared`).
- Ніки: `Оля 23a`, `Петро 23a`, `Тарас 23a`. Адреси: `olya23a@`, `petro23a@`, `taras23a@example.com`.
- Нагороди Олі — прямою вставкою в `prizeAward` (поля за схемою, `awardedAt` різні):
  - K — кубок золотий «Кубок Києва 23a», найновіша;
  - M — медаль срібна;
  - S — зірка;
  - D — лише диплом;
  - R — лише `real` «Вареники 23a».
- Ачівки Олі — `userAchievement`: `first_game`, `host`, `sniper`, `games_10`, `fast_answer`, `night_owl` (різні `earnedAt`).
- Вікторина Тараса «Дніпро 23a» (класика, 2 запитання):
  1. `boolean` «Дніпро впадає в Чорне море?» → «так»;
  2. `boolean` «Говерла вища за Монблан?» → «ні».

- [ ] **Step 1: Add the scenario** у кінець файла за зразком 22a:
  ```ts
  it('part 23a: blood moon — five menu items fit 320–1280 px in all seven languages, the profile is a header with four numbers and eight tiles, the auto shelf puts the newest cup in the middle, Оля pins three prizes and five achievements with a clear limit message, a deleted award leaves the shelf, Петро sees her pinned shelf on the public profile, old addresses open the new sub-pages, a wrong answer shows ✗ in its own tone on the phone and the stage, and motifs stay still under reduced motion', async () => {
    try {
      await bloodMoon23a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `bloodMoon23a()`:**
  1. **Акаунти.** Оля 375 × 812, Петро 1280 × 800, Тарас 1280 × 800; ніки через `PUT /api/me/profile`. Вставити нагороди й ачівки Олі.
  2. **Меню у 7 мовах.** `menuLinks(olya)` = `MENU_ITEMS_23A`. Для кожної `LOCALES`:
     - `PUT /api/me/locale`, перезавантажити `/profile`;
     - `expectFiveItems(olya, w)` для `w` у `[320, 360, 375, 414, 701, 768, 1024, 1280]`;
     - на 320 px кожна `.profile-tiles a` має `scrollWidth <= clientWidth`, `noSideScroll` → `true`.
     - Кадри `p23a-menu-<lang>-320`, а для `ar` ще `p23a-profile-ar` (плитки справа наліво: перша плитка правіша за другу). Повернути `uk`.
  3. **Шапка й плитки (375).**
     - `body` має `background-color` `rgb(6, 5, 5)`;
     - `h1` «Оля 23a», «Рів.», чотири `.headline-stats dd`;
     - вісім плиток; «Призи, 5», «Досягнення, 6».
     - Кадр `p23a-profile`.
  4. **Автополиця.** `section.shelf .is-main` має підпис «Кубок» (K — новіший за інші трофеї); у полиці 3 предмети: K, M, S, без D та R. Натиснути K → діалог `PrizeViewer` → закрити. Кадр `p23a-shelf`.
  5. **Закріплення призів.**
     - Плитка «Призи» → `/profile/prizes`, розділ «Нагороди»;
     - «📌 На вітрину» на D, M, K (у цьому порядку). Кнопка S → видно «На вітрині вже 3 кубки — спершу прибери один.», `aria-pressed` у S лишився `false`;
     - «Назад» → `/profile`. Полиця в DOM-порядку `[M, D, K]` (`shelfColumns([D, M, K])`), `.is-main` — D (диплом). Кадр `p23a-pinned`.
  6. **Закріплення ачівок через аліас.**
     - `olya.goto('/achievements')` → `h1` «Досягнення», «Назад», «Профіль» у меню з `aria-current="page"`;
     - закріпити `sniper`, `host`, `first_game`, `games_10`, `fast_answer`; на `night_owl` → «На вітрині вже 5 ачівок — спершу прибери одну.»;
     - на `/profile` у `.achievement-showcase` п'ять квадратів у порядку закріплення. Дотик першого → підпис з назвою `sniper`.
  7. **Видалена нагорода.** `await deleteAward(db, <id M>)` → перезавантажити `/profile`: полиця з двох (D, K). На `/profile/prizes` закріпити S без повідомлення про ліміт.
  8. **Публічний профіль.**
     - Петро → `/profile/<olyaId>`: ті самі чотири числа, що в Олі;
     - `.profile-tiles` немає;
     - полиця — ті самі предмети в тому самому порядку, що в Олі;
     - ачівки — ті самі п'ять;
     - «Усі нагороди (4)» розгортає 4 `.award-card`.
     - Кадр `p23a-public` (1280).
  9. **Аліаси без сесії.** Новий контекст без входу: `/friends` → `/login?next=%2Ffriends`; увійти як Оля → повернення на `/friends` з `h1` «Друзі». Так само `/profile/settings`.
  10. **Гра: «неправильно».**
      - Тарас запускає «Дніпро 23a», сцена в окремій сторінці 1280 × 800, Оля приєднується з телефона;
      - на 1-ше запитання Оля відповідає «ні» (неправильно), на 2-ге — «ні» (правильно);
      - після вердикту 1-го на телефоні `.result.is-wrong h2`: `getComputedStyle(el, '::before').content` містить `✗`, а `getComputedStyle(result).borderColor` (чи `color`) ≠ кольору `--accent` (`rgb(224, 37, 49)`);
      - на сцені правильний варіант `.is-correct`;
      - кадри `p23a-phone-wrong`, `p23a-stage`, `p23a-host`. `.game-bg` є на всіх трьох.
  11. **Менше руху.** `olya.emulateMedia({ reducedMotion: 'reduce' })`, `/profile`: `getComputedStyle(.crows).animationName === 'none'`, так само `.moon`. Без емуляції — `.crows` має анімацію.
  12. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** `pnpm build`, потім на передньому плані `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 23a"` → PASS.
- [ ] **Step 3: Візуальна перевірка кадрів `p23a-*`** (переглянути кожен, у звіті перелічити, що видно):
  - тло майже чорне, червоний лише акцентом, без неону;
  - на телефоні й сцені запитання читається, ✗ не налазить на текст, «неправильно» не схоже на акцентну кнопку;
  - місяць і ворони в шапці профілю не закривають ніку й чисел;
  - плитки по 4 в ряд, підписи не обрізані (зокрема de, pl, ar на 320);
  - полиця: середній предмет найбільший;
  - арабська дзеркальна, числа читаються.
  Знайдене виправити у відповідному коді з тестом і прогнати сценарій ще раз.
- [ ] **Step 4: Повний прогін — один раз, на передньому плані, частинами:** `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<шаблон>"` для кожного шаблону з «Глобальних обмежень» → усі PASS. Якщо не вистачає пам'яті, дрібніші шаблони; сказати про це у звіті.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 23a end-to-end — five menu items in seven languages from 320 to 1280 px, the tiled profile, the auto shelf, pinning with limit messages, a deleted award leaving the shelf, the public pinned shelf, alias addresses through sign-in, a ✗ wrong answer in its own tone, and still motifs under reduced motion

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
