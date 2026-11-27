# План 80. Навігація, етап 5 «Допомога й новачки»

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** гравець має власну коротку сторінку «Як грати» (`/help/play`), до якої веде головна, лобі гри (нова вкладка) і порожні «Вхідні»; довідка ведучого — з «Вікторин» і з налаштувань профілю, обидві сторінки посилаються одна на одну. Тема й легкий режим — один перемикач «Вигляд» у меню компʼютера і той самий блок «Вигляд сайту» на головній унизу й у налаштуваннях: легкий режим з головної — одним дотиком. Скарга на сайт скрізь зветься «Повідомити про проблему», скарга на вікторину — «Поскаржитися на вікторину». Відповіді адміністратора — на окремій сторінці «Мої звернення» (`/report/mine`) і у «Вхідних».

**Архітектура:** `PlayerHelp` (`apps/web/src/pages/PlayerHelp.tsx`) — статична сторінка з розділами з `i18n` (нові ключі `playHelp*`), значками з `guide-text.ts` / `buff-meta.ts` і маленькими CSS-макетами телефона (`aria-hidden`), вбудованим `EasyModeSwitch`. «Вигляд» — `AppearanceControls` (`apps/web/src/appearance/AppearanceControls.tsx`: радіокнопки теми + `EasyModeSwitch`) і `AppearanceMenu` (кнопка `aria-haspopup="dialog"` + поповер, `useDismiss`: Escape повертає фокус, клік поза поповером закриває) замість `ThemeToggle` у `Menu`; на телефоні (≤ 700 px) кнопку в нижній панелі сховано CSS. «Мої звернення» — `ProblemMine` (`apps/web/src/problems/ProblemMine.tsx`) поверх наявного `GET /api/me/problem-reports`; `/report` замість вбудованого списку показує посилання. Серверних змін немає.

**Стек:** React 19, react-router-dom 7, vitest + jsdom, playwright e2e.

**Специфікація:** `docs/superpowers/specs/2026-11-27-navigation-ux-design.md`, «Етап 5».

## Рішення будівельника

- **`/help/play` «Як грати»**, розділи (кожен — `section` з `h2` і значком): 🔢 Як увійти в гру (код з шести цифр у полі «Код гри» на головній, або «Відкриті ігри»; ім'я; акаунт не обов'язковий) · 📱 Як відповідати (таймер; огляд типів зі значками `TYPE_ICONS` і назвами `type_*`: торкнутися, ввести, розставити, мапа; перед раундом телефон сам покаже «Як грати» для цієї гри) · ✨ Бафи (шість частих зі значками й рядками `buffGuide_*`; які є в грі — вирішує ведучий) · ⚖️ Оскарження · 🙈 Не виходь з гри · 👓 Легкий режим (з вбудованим перемикачем — одним дотиком) · 🏆 Після гри (таблиця, досвід, досягнення, «Історія» → «Зіграні»). Унизу — «Хочеш провести свою гру?» → «Довідка ведучого». Ілюстрації — CSS-макети телефона з кодом, варіантами, кнопкою бафу й «⚖️ Оскаржити», без зовнішніх картинок.
- **Розділ меню `/help/play` — «Головна»** (гравець приходить з головної чи з гри; «Вікторини» — про власні вікторини); `/help` лишається у «Вікторинах». `BackLink`: `/help/play` → `/`, `/help` → `/quizzes` (як було). Назви вкладок: «Як грати», «Довідка ведучого» (`helpTitle` уже така).
- **Посилання:** низ головної — «Як грати» і «Довідка ведучого» поряд; лобі гравця (лише `phase === 'lobby'`) — маленьке `<a target="_blank" rel="noopener">` «Як грати» з підписом «відкриється в новій вкладці», бо сокет гри не має рватися; «Вхідні» порожні — «Як грати ›»; довідка ведучого — «Для гравців: Як грати ›»; налаштування профілю — розділ «Допомога»: «Як грати», «Довідка ведучого», «Повідомити про проблему», «Мої звернення». У «Вікторинах» «Довідка ведучого» вже є в панелі над списком.
- **«Вигляд»:** у меню компʼютера — кнопка «◐ Вигляд» (значок сонця/місяця за поточною темою + слово) з поповером «Вигляд сайту»: радіо «Світла · Темна · Як у системі» і «Легкий режим» (той самий `EasyModeSwitch`, з акаунтом зберігається в профілі). `ThemeToggle` в меню прибрано (лишився на ігрових екранах). На телефоні нижня панель без кнопки (`display: none` ≤ 700 px) — той самий блок `AppearanceControls` стоїть на головній унизу й у налаштуваннях профілю (замість окремих «Легкий режим» і списку «Тема»). Вхід і екран входу в гру лишаються з `ThemeSwitch` (ігрові екрани не міняються).
- **Назва «Вигляд»** уже зайнята плиткою профілю (рамки ніку, `/profile/looks`), тож кнопка в меню — «Вигляд», а заголовок поповера й блоків — «Вигляд сайту», щоб не плутати.
- **«Мої звернення» — `/report/mine`**: лише акаунт (гість — на вхід з `next`), «‹ Налаштування» (`BackLink parent="/profile/settings"`), список: дата, «Відкрите / Вирішене», текст, «Відповідь адміністратора: …»; порожньо — «Звернень ще не було.» + «Повідомити про проблему». `/report` для акаунта — рядок «Відповідь адміністратора прийде у «Вхідні» і в «Мої звернення».» з посиланням; вбудованого списку більше немає (одна річ — одне місце). Картка `problem_reply` у «Вхідних» → «Мої звернення» (`/report/mine`). Розділ меню — «Головна» (як `/report`).
- **Назви:** кнопка на сторінці бібліотечної вікторини — «Поскаржитися на вікторину», на публічному профілі — «Поскаржитися на профіль» (обидві відкривають той самий аркуш «Скарга»); ключ `reportButton` прибрано. В адмінці повідомлення про проблему більше не звуться «скаргами»: підвкладка «Повідомлення про проблеми», «Повідомлень немає.», «На це повідомлення вже відповіли.», рядки журналу «…на повідомлення про проблему…». «Щось не працює?» лишається заголовком форми (питання, а не назва).

## Глобальні обмеження

- **`GAME_STATE_VERSION` не змінювати**; міграцій БД і серверних змін немає; на ігрових екранах — лише посилання в лобі.
- Тексти — українською, нові uk-тексти на «ти»; нові ключі — у 7 мовах, список **`ADDED_80`** у `apps/web/src/i18n.test.ts` + тест «80 keys are in every locale». `pnpm l10n check <lang>` для en, de, es, it, pl, ar.
- **Prettier не запускати.** `python3` — заглушка. `git stash` — ні. Коментарі в коді — українською.
- Тести — у передньому плані, по одному запуску, `--maxWorkers=2`. E2E — `pnpm build`, потім по одному файлу з `timeout 590`.
- Коміти — англійською, наприкінці «(80)», з рядками `Co-Authored-By` і `Claude-Session`. Не зливати й не пушити.

## Review Focus

1. Поповер «Вигляд»: Escape повертає фокус на кнопку, клік поза ним закриває, `aria-expanded`, радіо працюють стрілками; на 320 px нижня панель не ширша й без кнопки.
2. Легкий режим з головної — один дотик (чекбокс у блоці «Вигляд сайту»), з акаунтом зберігається в профілі.
3. Посилання з лобі не виводить з гри (нова вкладка).
4. `/report/mine`: гість не бачить нічого чужого (вхід), відповідь адміністратора видно.
5. Сторінка «Як грати» на 320 px, у легкому режимі, світла тема, RTL — без бокового скролу.

---

### Задача 1. Сторінка «Як грати»

**Files:** Create `apps/web/src/pages/PlayerHelp.tsx`, `apps/web/src/pages/PlayerHelp.test.tsx`; Modify `apps/web/src/AppRoutes.tsx`, `apps/web/src/nav/page-meta.ts` (+ тест), `apps/web/src/nav/menu-section.ts` (+ тест), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`.

- [ ] **Крок 1: тести** — `/help/play`: `h1` «Як грати», сім `h2` у порядку, значки типів і бафів, перемикач «Легкий режим», посилання «Довідка ведучого» → `/help`, «‹ Головна»; `pageTitle('/help/play')` — «Як грати»; `menuSection('/help/play') === 'home'`, `menuSection('/help') === 'quizzes'`; ключі `ADDED_80` у 7 мовах.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати (ліниво завантажена сторінка, стилі `.player-help`, `.help-phone` на логічних властивостях). **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): «Як грати» page for players at /help/play — joining, answering, buffs, appeals, staying in the game, easy mode, after the game (80)`.

### Задача 2. Посилання на допомогу

**Files:** Modify `apps/web/src/pages/HomeFooter.tsx`, `apps/web/src/pages/Home.test.tsx`, `apps/web/src/screens/PlayerScreen.tsx` (+ тест лобі), `apps/web/src/inbox/InboxPage.tsx` (+ тест), `apps/web/src/pages/HostHelp.tsx` (+ тест), `apps/web/src/pages/profile/ProfileSettings.tsx` (+ тест), стилі, i18n.

- [ ] **Крок 1: тести** — низ головної: «Як грати» → `/help/play` і «Довідка ведучого» → `/help`; лобі гравця: посилання `/help/play` з `target="_blank"`, на запитанні — немає; порожні «Вхідні» — «Як грати»; довідка ведучого — «Як грати»; налаштування — розділ «Допомога» з чотирма посиланнями.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): help links — home footer, player lobby (new tab), empty inbox, host help and profile settings (80)`.

### Задача 3. «Вигляд»

**Files:** Create `apps/web/src/appearance/AppearanceControls.tsx`, `apps/web/src/appearance/AppearanceMenu.tsx`, `apps/web/src/appearance/appearance.test.tsx`; Modify `apps/web/src/menu/Menu.tsx`, `apps/web/src/menu/Menu.test.tsx`, `apps/web/src/pages/HomeFooter.tsx`, `apps/web/src/pages/profile/ProfileSettings.tsx`, тести, стилі, i18n.

- [ ] **Крок 1: тести** — `AppearanceControls`: три радіо, вибір пише тему; чекбокс «Легкий режим» вмикає режим одним кліком. `AppearanceMenu`: `aria-haspopup="dialog"`, `aria-expanded`, відкриття фокусує вибрану тему, Escape закриває й повертає фокус, `pointerdown` поза поповером закриває. Меню: немає `.menu-theme`, є «Вигляд». Головна й налаштування: блок «Вигляд сайту».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати; CSS: поповер під кнопкою, у RTL дзеркально; кнопку сховано ≤ 700 px. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): one «Вигляд» control — theme and easy mode in a menu popover on desktop, the same block on home and in settings (80)`.

### Задача 4. «Мої звернення»

**Files:** Create `apps/web/src/problems/ProblemMine.tsx`, `apps/web/src/problems/ProblemMine.test.tsx`; Modify `apps/web/src/problems/ProblemReport.tsx`, `apps/web/src/problems/ProblemReport.test.tsx`, `apps/web/src/inbox/InboxPage.tsx` (+ тест), `apps/web/src/AppRoutes.tsx`, `apps/web/src/nav/page-meta.ts` (+ тест), стилі, i18n.

- [ ] **Крок 1: тести** — `/report/mine`: список зі статусом і відповіддю, порожній стан з дією, помилка з «Спробувати ще раз», гість → вхід; `/report` з акаунтом — посилання «Мої звернення», без списку; «Вхідні» `problem_reply` → `/report/mine`; заголовок вкладки «Мої звернення».
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): «Мої звернення» page with statuses and admin replies, linked from /report, settings and the inbox (80)`.

### Задача 5. Назви скарг

**Files:** Modify `apps/web/src/pages/LibraryQuiz.tsx` (+ тест), `apps/web/src/pages/PublicProfile.tsx` (+ тест), `apps/web/src/i18n.ts`, `apps/web/src/locales/*.json`, `apps/web/src/i18n.test.ts`, `apps/web/src/admin/admin-text.test.ts`.

- [ ] **Крок 1: тести** — кнопки «Поскаржитися на вікторину» / «Поскаржитися на профіль»; рядок журналу «…на повідомлення про проблему…»; `reportButton` немає в жодній мові.
- [ ] **Крок 2:** FAIL. **Крок 3:** реалізувати; grep uk-текстів «скарг» поза скаргами на вміст. **Крок 4:** PASS.
- [ ] **Крок 5:** коміт `feat(web): «Поскаржитися на вікторину» and «на профіль»; problem reports are never called complaints (80)`.

### Задача 6. E2E і перевірка

**Files:** Modify `apps/server/e2e/part17-21-likes-feed-calendar-push-admin.e2e.ts` (`.menu-theme`), `part22-24-l10n-menus-profile.e2e.ts`, `part31-easy-mode.e2e.ts`, `part47-library.e2e.ts`, `part64-errors-backups.e2e.ts`, `part70-appeals-inbox.e2e.ts` та інші з grep.

- [ ] **Крок 1:** оновити перевірки: тема в меню — через «Вигляд» (компʼютер) / низ головної (телефон); легкий режим з головної одним дотиком; «Як грати» з головної й лобі (нова вкладка), 320 px; «Мої звернення» замість списку на `/report`; нові назви скарг і підвкладки.
- [ ] **Крок 2:** `pnpm build`; e2e по одному файлу; `pnpm typecheck`; веб-юніти частинами; `pnpm l10n check` для 6 мов.
- [ ] **Крок 3:** коміт `test(e2e): player help, the «Вигляд» control, «Мої звернення» and the new complaint names (80)`.
