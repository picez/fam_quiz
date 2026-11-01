# План 15a: досвід і рівні гравців (беклог #11)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** уся специфікація `docs/superpowers/specs/2026-11-01-levels-design.md`.
- Закінчена гра (`status='finished'`) дає досвід (XP) гравцям з акаунтами за правилами проти накрутки. Нове досягнення 12i теж дає XP.
- Рівень видно біля ніку: «Рів. N» у лобі, таблицях сцени, пульта й телефона та в профілі.
- Нові рівні відкривають косметику (колір ніку, рамку, значок профілю, серії стікерів 13a) і три невеликі ігрові бонуси рівня: «+5 с», «Підказка рівня», «Оберіг».
- Ведучий вимикає бонуси рівнів у налаштуваннях вікторини (`levelBonuses: false`).
- Давні гравці отримують досвід за вже зіграні ігри (ретро-нарахування).

**Spec:** `docs/superpowers/specs/2026-11-01-levels-design.md`

**Передумова:** 13a, 13b і 14a уже в `main`. Міграції до `0021_prizes` зайняті, наша — **`0022_levels`**. Нове поле `Room` (`levels`) дописується в обидва літерали (`open`, `restore`) і в `continueSaved` / `restartSaved`, поруч із полями 14a (`prizes`, `titles`).

**Стан гри змінюється: `GAME_STATE_VERSION` 21 → 22.**
- **Чому без підняття не обійтись.** Специфікація кладе вимикач у налаштування вікторини поряд із `buffs` / `debuffShop`. `QuizSettings` лежить у `GameState.quiz`, а `restore.test.ts` закріплює ключі `QuizSettings` за `GAME_STATE_VERSION` (так 9c підняв версію для `debuffPrices`, 12e для `awayPenalty`). Тож новий ключ `levelBonuses` сам по собі вимагає 22.
- **Чому тоді бонуси теж у стані.** Варіант «бонуси на рівні кімнати (як `Room.titles`) і звичайні видачі 12h» не чистий: 12h не має видач на гравця. `allowedBuffs` спільний для всієї вікторини, `buffsUsed` рахує вид, тож «+5 с» рівня з'їв би власний «Додатковий час» вікторини. А «Оберіг» має перехопити дебаф у рушії (`setDebuff`, `buyDebuff`). Тому, раз версію піднімаємо все одно, бонуси лежать у рушії: `GameState.perks?` (необов'язкове). Так вони переживають перезапуск 9b, збереження 13b й автопілот без окремого конверта.
- **Підняття лише додає необов'язкові ключі.** `READABLE_STATE_VERSIONS` дістає `21`. Стан v21 — це «бонусів немає, вимикач увімкнено», і він відновлюється без перетворень. Тож **деплой уперед живих ігор не обриває**. Ламається лише відкат на старий сервер, коли вже є кімнати v22.
- **Перед пушем спитати власника** (правило «Deploys kill live games» для кожного підняття `GAME_STATE_VERSION`). Повідомлення — «версія стану 22, лише нові необов'язкові ключі, живі ігри v21 відновлюються». Правило «Push hold while playing» діє як завжди.
- Рівні й косметика біля ніку **не** в стані: `Room.levels` + `view.levels`, як титули 14a. Конверт `SavedRoom` не змінюється: після перезапуску рівні знову підтягує `attachLevels`.

**Архітектура:**
- **Shared** (`packages/shared/src/levels.ts`): числа нарахування, крива рівнів, таблиця нагород до 30-го, косметика, бонуси рівня, відкриті стікери, рідкість досягнень, схема вибору косметики.
- **Рушій** (`packages/engine/src/perks.ts`):
  - сервер видає бонуси гравцеві (`grantPerks`), гравець натискає «+5 с» і «Підказку» (`usePerk`);
  - «Оберіг» гасить перший дебаф у `setDebuff` / `buyDebuff`;
  - зріз телефона — `me.perks`, а `wards` бачать телефон (крамниця) і пульт.
- **Сервер:**
  - журнал `xp_entry` і чисті правила (`xp-rules.ts`);
  - нарахування за гру в черзі рекордера після призів (`creditGame`, ідемпотентне за унікальним ключем);
  - ретро й наздоганяння за міткою `profile.xp_synced_at` (`syncXp`, як 12i);
  - рівні кімнати (`attachLevels` → `manager.setLevels` → `syncPerks`), замок стікерів у `react`;
  - профіль (`level`) і `PUT /api/me/looks`.
- **Веб:**
  - компонент `Nick` (нік з кольором і рамкою, «Рів. N», титул 14a) замість п'яти місць із `.nick-title`;
  - ряд бонусів рівня на телефоні, 🛡 на пульті й у крамниці;
  - замкнені стікери;
  - вимикач у `PowersEditor` і рядок у лобі;
  - розділ «Рівень» у профілі.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

## Рішення (там, де специфікація лишила місце будівникові)

- **Крива.** `xpForLevel(N)` — загальний досвід, з яким починається рівень N: `N ≤ 1 → 0`, інакше `Math.round(100 × N^1.5 / 10) × 10`. Старт — рівень 1 з 0 XP. Опорні значення:

  | Рівень | XP |
  |---|---|
  | 2 | 280 |
  | 3 | 520 |
  | 5 | 1120 |
  | 10 | 3160 |
  | 15 | 5810 |
  | 20 | 8940 |
  | 30 | 16430 |

  Стелі немає: `levelOf(xp)` росте далі. Нагороди розписані до 30-го.
- **Нарахування за гру** (`LEVEL_XP`): участь 50; кожне запитання з правильною відповіддю (рядок `accepted`, рахується за `questionIndex` без повторів, тож спроби бліцу не множать) 10; місце 1/2/3 (`rank`, нічия ділить місце) 100/60/30. Денна стеля 600 за добу Києва (`kyivDay(finishedAt)`).
- **Хто може отримати досвід.** Людина з акаунтом, що є в підсумковій таблиці (`rank !== null`; кого прибрали kick-ом, рядка з місцем не має). Соло — гравець, командна гра — людина команди. Причини нуля (`XpReason`) перевіряються в такому порядку:
  1. `few_questions` — гра задала менше 5 запитань (`questionsPlayed < 5`);
  2. `few_accounts` — у таблиці менше 3 різних акаунтів, **не рахуючи автора вікторини**. Інакше автор + 2 запасні акаунти накрутили б досвід запасним. Це строгіше за специфікацію, але в її дусі;
  3. `author` — ця людина є автором вікторини (`quiz.owner_id`; якщо вікторину видалено й власника не знайти, правило не діє, а id вікторини з `game.quiz_id` лишається);
  4. `repeat_quiz` — ця людина вже має **зараховану** (`counted`) гру з тим самим `quiz_id`. Гра, що дала 0 через `few_accounts` / `few_questions`, вікторину не «з'їдає»: перша чесна гра в неї ще дасть досвід. Гра, урізана стелею, вікторину з'їдає (вона зарахована).
  - Рядок `xp_entry` пишеться **для кожного акаунта таблиці**, навіть з 0 і причиною. Так повтор і наздоганяння бачать, що гру вже розібрано.
- **Командна гра.** Учасник отримує 50 і по 10 за свої правильні: рядки команди, де `answered_by` — його рядок людини, або `answered_by` null (старі ігри чи усна відповідь — тоді зараховується всім людям команди). Місце — місце команди.
- **Досягнення.** Кожен рядок `user_achievement` дає XP один раз (`source 'achievement'`, унікально за `(user, achievement)`), поза денною стелею. Це стосується й «давніх» (earned_at null): вони теж частина ретро. Рідкості в 12i немає, тож вона тут фіксована: `COMMON_ACHIEVEMENTS` 25, `EPIC_ACHIEVEMENTS` 100, решта rare 50 (списки — задача 1).
- **Ретро-нарахування** — ліниве, на користувача, як 12i, а не пакетна робота на старті сервера.
  - Поки `profile.xp_synced_at` null, перше звернення (`syncXp`: профіль, лобі через `attachLevels`, нарахування гри) програє всі `finished` ігри користувача-гравця в хронологічному порядку (`finished_at`, далі id) за тими самими правилами, **без стелі**, з `retro = true`. Потім додає досягнення й ставить мітку.
  - Далі `syncXp` наздоганяє: ігри після мітки без власного рядка рахуються вже **зі стелею**, а мітка переходить на найпізнішу. Так гра, нарахування якої вичерпало повтори рекордера, не губиться.
- **Журнал `xp_entry`**, сума — на читанні (`sum(amount)`), без кешу в профілі, тож розходження немає. Денна стеля рахується в транзакції після `select … for update` рядка `profile` користувача: дві гри, що закінчились одночасно, разом не перейдуть 600.
- **Бонуси рівня** (`LEVEL_PERKS = ['time', 'hint', 'ward']`):

  | Рівень | Бонус | Як діє |
  |---|---|---|
  | 5 | «+5 с» (`time`) | кнопка; додає `PERK_TIME_MS.base` = 5000 до особистого часу (`overtime` + 5000, додається до «Додаткового часу» 12h, а не замість нього) |
  | 10 | «Підказка рівня» (`hint`) | кнопка; показує `hint`, яку написав автор (запасного — якщо гравець відповідає на запасне). Лише там, де текст є: ведучому нічого не треба писати |
  | 15 | «Оберіг» (`ward`) | пасивний; гасить перший дебаф проти гравця |
  | 20 | «+5 с» стає «+10 с» | `PERK_TIME_MS.boosted` = 10000 |

  - Кожен бонус — раз за гру. Він не займає місце бафу 12h (`buff_busy` не діє) і не вважається використаним бафом.
  - Кнопки працюють там само, де бафи 12h (`buffsHere`). У бліці, фіналі, «Ва-банк», «Вибуванні», «Мільйонері», ланцюжку, сортуванні, стіні й опитуваннях їх немає, як і бафів.
  - «Підказка рівня» і баф «Підказка» на тому самому запитанні взаємовиключні: другий отримує блок `unfit` / `taken`.
- **«Оберіг».** Дебаф ведучого (`setDebuff`) на гравця з готовим оберегом — `ok`: дебаф не ставиться, оберіг `spent`. Купівля (`buyDebuff`) — `ok`: ціну списано (покупець бачив 🛡 і вирішив зламати оберіг), дебаф не ставиться, оберіг `spent`. Готовий оберіг видно ведучому (🛡 біля гравця) і в крамниці (🛡 біля цілі). Ціль бачить «🛡 Оберіг погасив дебаф».
- **Видача.** Сервер видає бонуси один раз на гравця за гру: `grantPerks` пропускає тих, хто вже має запис. Видача відбувається в `start`, у `join` після старту (пізній гравець) і в `setLevels` (рівень прийшов з бази пізніше за старт або кімнату відновлено зі стану v21).
  - Видаються лише ті бонуси, механіка яких у вікторині є (`perkFits`): `time` — є запитання з таймером; `hint` — є запитання з `hint` (разом із запасними); `ward` — `allowedDebuffs(quiz)` не порожній. Інших немає ні в стані, ні на екрані.
- **Без бонусів:** `settings.levelBonuses === false`, командна гра (рівень особистий, а учасник таблиці — команда; об'єднання бонусів людей росло б із розміром команди), гості (рівня немає).
- **Вимикач помітний.** У `PowersEditor` є «Бонуси рівнів» (типово увімкнено: увімкнення прибирає ключ, вимкнення пише `false`). У лобі пульта й телефона — рядок «Бонуси рівнів увімкнено» / «Бонуси рівнів вимкнено ведучим». Зріз несе `levelBonuses?: false`.
- **Стікери.** `stickerSeriesOpen(level)`: `nya` з 1-го, `nyaa` з 3-го, `nyas` з 6-го, `other` з 9-го. Гість (`level null`) має стартовий набір (`nya`) і швидкі емодзі. `QUICK_EMOJI` (зараз 6) доступні всім, специфікація говорить про «5», бо писалась раніше. Сервер відхиляє закритий стікер від гравця (`sticker_locked`), ведучий (`'host'`) має все. `PUT /api/me/stickers` не перевіряє, а UI показує закриті улюблені з 🔒.
- **Косметика й таблиця нагород** (`LEVEL_REWARDS`, рівно одна нагорода на рівень 1–30):

  | Рівень | Нагорода | Рівень | Нагорода | Рівень | Нагорода |
  |---|---|---|---|---|---|
  | 1 | стікери `nya` | 11 | колір `sun` | 21 | рамка `neon` |
  | 2 | колір `sky` | 12 | рамка `silver` | 22 | колір `gold` |
  | 3 | стікери `nyaa` | 13 | значок 🎯 | 23 | значок 🦉 |
  | 4 | значок ⭐ | 14 | колір `coral` | 24 | значок 🚀 |
  | 5 | бонус `time` | 15 | бонус `ward` | 25 | рамка `fire` |
  | 6 | стікери `nyas` | 16 | рамка `gold` | 26 | колір `rainbow` |
  | 7 | колір `mint` | 17 | значок 🧠 | 27 | значок 🏅 |
  | 8 | рамка `bronze` | 18 | колір `violet` | 28 | значок 💎 |
  | 9 | стікери `other` | 19 | значок ⚡ | 29 | значок 🔱 |
  | 10 | бонус `hint` | 20 | `perk_boost` (`time`) | 30 | рамка `rainbow` |

  - Колір і рамку видно біля ніку в лобі й таблицях, значок — у профілі біля ніку.
  - Що носити, гравець обирає в профілі з відкритого: `PUT /api/me/looks`, а закрите → 409 `look_locked`.
  - Якщо рівень колись упаде (модерація #23), закрите вбрання просто не показується: `looksShown` фільтрує його на читанні.
- **Історія нагород у профілі.** Мить відкриття рівня L — перший рядок журналу (за `at`, далі id), на якому накопичена сума досягла `xpForLevel(L)`. Ретро-рядки мають `at = finished_at` гри, рядки досягнень — `earned_at` (давні — `null` → «давно»).
- **Рівень у зрізах:** `view.levels?: Record<нік людини, NickLevel>` (`{ level, color, frame }`), ключ — нік, як у `titles`. У рядках команд таблиці рівень не ставиться. Сцена, пульт і телефон показують однаково.
- **Без «+N досвіду» у фіналі гри.** Нарахування йде в черзі рекордера після запису історії й часто пізніше за фінальний екран. Досвід видно в профілі. Це навмисне обмеження, щоб нарахування не затримувало фінал (анти-ціль специфікації).
- **Нові коди помилок** (`ErrorCode` у shared): `perk_used`, `perk_unfit`, `sticker_locked`; HTTP — `look_locked`. Тексти — `err_*` у `i18n.ts`.
- **Меню** не змінюється: 6 пунктів, рівень живе в «Профілі».

## Глобальні обмеження

- **Анти-ціль:** вимикач працює. З `levelBonuses: false` у стані немає жодного `perks`: ні на старті, ні для пізнього гравця, ні після `setLevels`. Телефон не показує ряду бонусів, а дебафи діють як без оберегу.
- **Анти-ціль:** досвід не накрутити двома акаунтами чи грою з собою. Правило «3 акаунти без автора» стоїть першим після «5 запитань».
- **Анти-ціль:** нарахування не затримує й не ламає завершення гри. `creditGame` — останній крок черги рекордера, після історії, ачівок і призів. Збій іде в `onError` і повтор, а наздоганяння `syncXp` підбирає те, що не вдалося.
- **Анти-ціль:** нічого не нараховується двічі: унікальні `(user_id, game_id)` для `game` і `(user_id, achievement_id)` для `achievement`, `onConflictDoNothing`.
- `GAME_STATE_VERSION` = 22, `READABLE_STATE_VERSIONS` дістає 21. **Перед пушем — питання власникові** (див. шапку).
- Жодного контенту про росію (правило власника): e2e-вікторина — про Україну, відповіді «так»/«ні» змішані.
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts` через `t()`, тон «ти», коротко.
- Меню телефона — 6 пунктів, не більше.
- Телефон 375 px без горизонтальної прокрутки; сцена 1280 × 720 без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 15a"`, **лише на передньому плані**. Кадри — `apps/server/e2e/artifacts/shots/p15a-*`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```
- Після останньої задачі й фінальної рецензії: злити в `main`. **Пуш — лише після «так» власника** (підняття версії стану).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/levels.ts` (новий), `levels.test.ts` (новий), `views.ts`, `profile.ts`, `events.ts`, `game.ts` (`ErrorCode`), `index.ts` | крива, нагороди, косметика, бонуси, стікери, рідкість; типи зрізів і профілю; подія `player:perk` | 1 |
| `packages/shared/src/quiz.ts`, `packages/engine/src/game.ts`, `perks.ts` (новий), `game.perks.test.ts` (новий), `buffs.ts`, `debuffs.ts`, `views.ts`, `views.perks.test.ts` (новий), `restore.ts`, `restore.test.ts`, `index.ts` | `levelBonuses`, `GameState.perks`, бонуси, оберіг, зрізи, версія 22 | 2 |
| `apps/server/src/xp-rules.ts` (новий), `xp-rules.test.ts` (новий) | чисті правила нарахування, стеля, доба Києва | 3 |
| `apps/server/drizzle/0022_levels.sql` + `meta`, `src/db/schema.ts`, `src/xp-store.ts` (новий), `xp-store.test.ts` (новий) | журнал, нарахування гри, досягнення, ретро й наздоганяння, рівні акаунтів, вбрання | 4 |
| `apps/server/src/rooms/levels.ts` (новий), `rooms/manager.ts`, `rooms/manager.levels.test.ts` (новий), `src/levels.ts` (новий), `levels.test.ts` (новий), `socket.ts`, `app.ts` | рівні кімнати, видача бонусів, `player:perk`, замок стікерів | 5 |
| `apps/server/src/recorder.ts`, `recorder.levels.test.ts` (новий), `profiles.ts`, `profiles.test.ts`, `profile-routes.ts`, `profile-routes.test.ts` | нарахування в черзі, рівень у профілі, `PUT /api/me/looks` | 6 |
| `apps/web/src/screens/Nick.tsx` (+ тест), `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `Standings.tsx`, `StageTeams.tsx` (+ тести), `i18n.ts`, `styles.css` | нік з рівнем, кольором, рамкою й титулом | 7 |
| `apps/web/src/screens/Perks.tsx` (+ тест), `PlayerScreen.tsx`, `DebuffShop.tsx`, `HostPlayerTools.tsx` (+ тести), `i18n.ts`, `styles.css` | бонуси рівня на телефоні, 🛡 на пульті й у крамниці | 8 |
| `apps/web/src/screens/ReactionSheet.tsx` (+ тест), `editor/PowersEditor.tsx` (+ тест), `help/settings.ts`, `HostScreen.tsx`, `AuthorLobby.tsx`, `PlayerScreen.tsx`, `i18n.ts` | замкнені стікери, вимикач, рядок у лобі | 9 |
| `apps/web/src/profile/LevelCard.tsx` (+ тест), `pages/Profile.tsx`, `pages/PublicProfile.tsx` (+ тести), `api.ts`, `i18n.ts`, `styles.css` | розділ «Рівень», вибір вбрання, рівень і значок у профілях | 10 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 15a | 11 |

## Порядок збирання

- 1 → 2 (shared і рушій) → 3 → 4 → 5 → 6 (сервер по черзі: `manager.ts`, `app.ts`, `schema.ts` спільні) → 7 → 8 → 9 → 10 (веб: спільні `i18n.ts`, `styles.css`, `PlayerScreen.tsx`, `HostScreen.tsx`) → 11.
- **Навмисні зміни наявних очікувань** (лише ці; інший червоний старий тест рецензент розбирає як регресію):
  - `restore.test.ts`: закріплена форма — `KEYS[22]`, `READABLE_STATE_VERSIONS` закінчується `…, 20, 21, 22`;
  - `manager.answerer.test.ts`, `manager.drafts.test.ts` (і будь-який інший `expect(GAME_STATE_VERSION).toBe(21)`) → `22`;
  - тести, що порівнюють `ownProfile` / `publicProfile` повним `toEqual`, тепер мають поле `level`;
  - тести з `.nick-title` у `Standings` / `StageTeams` / екранах шукають титул усередині `.nick` (розмітка задачі 7), а текст і клас `.nick-title` лишаються.

## На що дивитися рецензентові (Review Focus)

1. **Денна стеля на межі доби й у гонці.** Дві гри Олі закінчуються одночасно (дві кімнати, одна черга кожна), обидві по 400 XP → разом 600, не 800. Гра о 23:59 і о 00:01 за Києвом (UTC+2/+3, зміна часу) — дві різні доби. Тест — задачі 3 (`kyivDay`) і 4 (паралельні `creditGame`).
2. **Ретро зустрічається з живим нарахуванням.** Перше в житті читання профілю Олі (`syncXp`, мітки ще немає) іде одночасно з `creditGame` гри, що щойно закінчилась. Наслідок: один рядок на гру, сума не подвоєна, `repeat_quiz` однаковий за будь-якого порядку. Тест — задача 4.
3. **Оберіг проти крамниці й ведучого.** Покупка на ціль з оберегом: ціна списана, дебафу немає, оберіг `spent`, а наступна покупка діє звичайно. Ведучий на ціль з оберегом: дебафу немає, нічого не списано. Стан v21 без `perks`: дебафи як завжди. Тест — задача 2.
4. **Бонуси там, де не мають бути.** Вимикач `false`, командна гра, гість, автопілот без `hint` у запитаннях. Пізній гравець і `setLevels` після старту не обходять вимикач. «+5 с» без таймера (відео) → `perk_unfit`. Тест — задачі 2, 5.
5. **Телефон 375 px з усім біля ніку:** нік на 20 символів + рамка + «Рів. 27» + титул 14a на 32 символи в лобі, таблиці й `StageTeams`. Також ряд бафів 12h + ряд бонусів рівня, аркуш стікерів із замками, розділ «Рівень» у профілі. Усе без прокрутки вбік. Тест — задачі 7, 8, 11 (`expectNoSideScroll`).

---

### Задача 1. Shared: рівні, нагороди, косметика, бонуси, типи зрізів і профілю

**Files:**
- Create: `packages/shared/src/levels.ts`, `packages/shared/src/levels.test.ts`
- Modify: `packages/shared/src/views.ts`, `packages/shared/src/profile.ts`, `packages/shared/src/events.ts`, `packages/shared/src/game.ts`, `packages/shared/src/index.ts`

**Interfaces:**
- Produces (`packages/shared/src/levels.ts`):
  ```ts
  export const LEVEL_XP = { join: 50, correct: 10, place: [100, 60, 30], dailyCap: 600, minAccounts: 3, minQuestions: 5 } as const;
  export const ACHIEVEMENT_XP = { common: 25, rare: 50, epic: 100 } as const;
  export type AchievementRarity = keyof typeof ACHIEVEMENT_XP;
  export const COMMON_ACHIEVEMENTS: readonly AchievementId[] = ['first_game', 'first_win', 'host', 'games_10', 'streak_5', 'fast_answer', 'early_bird', 'night_owl'];
  export const EPIC_ACHIEVEMENTS: readonly AchievementId[] = ['games_100', 'wins_10', 'host_10', 'streak_10', 'perfect_game', 'win_streak_3', 'ladder_top', 'all_rounds', 'all_types', 'podium_10', 'veteran'];
  export function achievementRarity(id: AchievementId): AchievementRarity; // поза двома списками — 'rare'
  export function xpForLevel(level: number): number;
  export function levelOf(xp: number): number; // ≥ 1
  export interface LevelProgress { level: number; xp: number; levelAt: number; nextAt: number }
  export function levelProgress(xp: number): LevelProgress;

  export const LEVEL_PERKS = ['time', 'hint', 'ward'] as const;
  export type LevelPerk = (typeof LEVEL_PERKS)[number];
  export type ActivePerk = Exclude<LevelPerk, 'ward'>;
  export const PERK_TIME_MS = { base: 5_000, boosted: 10_000 } as const;
  export interface PerkGrant { kinds: LevelPerk[]; timeMs: number }
  export function perksFor(level: number): PerkGrant; // kinds у порядку LEVEL_PERKS

  export const NICK_COLORS = ['sky', 'mint', 'sun', 'coral', 'violet', 'gold', 'rainbow'] as const;
  export type NickColor = (typeof NICK_COLORS)[number];
  export const NICK_FRAMES = ['bronze', 'silver', 'gold', 'neon', 'fire', 'rainbow'] as const;
  export type NickFrame = (typeof NICK_FRAMES)[number];
  export const PROFILE_BADGES = ['⭐', '🎯', '🧠', '⚡', '🦉', '🚀', '🏅', '💎', '🔱'] as const;
  export type ProfileBadge = (typeof PROFILE_BADGES)[number];
  export type LevelReward =
    | { kind: 'stickers'; series: StickerSeries }
    | { kind: 'color'; id: NickColor }
    | { kind: 'frame'; id: NickFrame }
    | { kind: 'badge'; id: ProfileBadge }
    | { kind: 'perk'; perk: LevelPerk }
    | { kind: 'perk_boost'; perk: 'time' };
  /** Таблиця з «Рішень», рівні 1..30 по одному. */
  export const LEVEL_REWARDS: readonly { level: number; reward: LevelReward }[];
  export function rewardsUpTo(level: number): { level: number; reward: LevelReward }[];
  /** null — гість: лише 'nya'. */
  export function stickerSeriesOpen(level: number | null): StickerSeries[];
  export function stickerOpen(id: string, level: number | null): boolean; // невідомий id — false
  /** Рівень, з якого відкрито серію (для «з рівня N»). */
  export function seriesLevel(series: StickerSeries): number;

  export interface NickLooks { color: NickColor | null; frame: NickFrame | null; badge: ProfileBadge | null }
  export const looksSchema: z.ZodType<NickLooks>; // .strict()
  export function looksAllowed(looks: NickLooks, level: number): boolean;
  /** Відкидає закрите (рівень упав): кожне поле або відкрите, або null. */
  export function looksShown(looks: NickLooks, level: number): NickLooks;
  /** Біля ніку в зрізах. */
  export interface NickLevel { level: number; color: NickColor | null; frame: NickFrame | null }
  export interface LevelUnlock { level: number; reward: LevelReward; at: string | null }
  export interface OwnLevel { progress: LevelProgress; unlocked: LevelUnlock[]; next: { level: number; reward: LevelReward }[]; looks: NickLooks }
  export interface PublicLevel { level: number; looks: NickLooks }
  export const perkSchema: z.ZodType<{ kind: ActivePerk }>;
  ```
- `views.ts`:
  - `BaseView` дістає `levels?: Record<string, NickLevel>` (коментар «ставить сервер, рушій ключа не ставить», як `titles`) і `levelBonuses?: false` (ставить рушій, лише коли вимкнено);
  - `PerkBlock = 'used' | 'elsewhere' | 'answered' | 'paused' | 'time' | 'not_started' | 'unfit'`;
  - `PerksView { items: { kind: ActivePerk; block: PerkBlock | null }[]; timeMs: number; hint: string | null }`;
  - у `PlayerView.me` поряд із `buffs`: `perks: PerksView | null`;
  - `PlayerView.wards?: Record<string, 'ready' | 'spent'>` і `HostView.wards?: Record<string, 'ready' | 'spent'>` (id гравця);
  - у `PlayerShop.targets[]` — `warded: boolean`.
- `game.ts`: `ErrorCode` дістає `'perk_used' | 'perk_unfit' | 'sticker_locked'`.
- `profile.ts`: `OwnProfile.level: OwnLevel`, `PublicProfile.level: PublicLevel`.
- `events.ts`: подія клієнта `'player:perk'` з `perkSchema` (за зразком `player:react`).

- [ ] **Step 1: Write the failing tests** — `packages/shared/src/levels.test.ts`:
  - `xpForLevel`: `1 → 0`, `2 → 280`, `3 → 520`, `5 → 1120`, `10 → 3160`, `15 → 5810`, `20 → 8940`, `30 → 16430`; для кожного N від 1 до 60 `xpForLevel(N+1) > xpForLevel(N)`.
  - `levelOf`: `0 → 1`, `279 → 1`, `280 → 2`, `3159 → 9`, `3160 → 10`, `100000 → ` число > 30.
  - `levelProgress(600)` → `{ level: 3, xp: 600, levelAt: 520, nextAt: 800 }`.
  - `LEVEL_REWARDS.map((r) => r.level)` дорівнює `[1, 2, …, 30]`. Нагорода 5 — `{ kind: 'perk', perk: 'time' }`, 10 — `hint`, 15 — `ward`, 20 — `perk_boost`. Кожен `NICK_COLORS`, `NICK_FRAMES`, `PROFILE_BADGES` трапляється рівно раз.
  - `perksFor(4)` → `{ kinds: [], timeMs: 5000 }`; `perksFor(10)` → `{ kinds: ['time', 'hint'], timeMs: 5000 }`; `perksFor(20)` → `{ kinds: ['time', 'hint', 'ward'], timeMs: 10000 }`.
  - `stickerSeriesOpen(null)` і `(1)` → `['nya']`; `(3)` → `['nya', 'nyaa']`; `(9)` → `STICKER_SERIES`. `stickerOpen(<перший id серії nyas зі STICKERS>, 5)` → false, `(…, 6)` → true. `stickerOpen('nope', 30)` → false.
  - `looksSchema`: `{ color: 'sky', frame: null, badge: '⭐' }` → ok; `{ color: 'pink', … }` → помилка; зайвий ключ → помилка.
  - `looksAllowed({ color: 'sky', frame: null, badge: null }, 1)` → false, `(…, 2)` → true. `looksShown({ color: 'rainbow', frame: 'bronze', badge: '⭐' }, 10)` → `{ color: null, frame: 'bronze', badge: '⭐' }`.
  - `achievementRarity('first_game') === 'common'`, `('veteran') === 'epic'`, `('sniper') === 'rare'`. Кожен id з обох списків є в `ACHIEVEMENTS`, а списки не перетинаються.
  - `perkSchema`: `{ kind: 'time' }` ok, `{ kind: 'ward' }` → помилка.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/levels.test.ts` → FAIL (модуля немає).
- [ ] **Step 3: Implement** `levels.ts`, експорт з `index.ts`, типи у `views.ts`, `profile.ts`, `game.ts`, `events.ts`.
  - Якщо `typecheck` падає там, де будуються `OwnProfile` / `PublicProfile`, тимчасово поставити `level: { progress: levelProgress(0), unlocked: [], next: [], looks: { color: null, frame: null, badge: null } }` / `{ level: 1, looks: … }` (справжнє значення — задача 6).
  - `me.perks` у зрізі рушія — тимчасово `null`, `targets[].warded` — `false` (справжнє — задача 2).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src/profiles.ts
  git commit -m "feat(shared): levels groundwork — the XP numbers and level curve, one reward per level up to 30 with nick colours, frames, profile badges, sticker series and level perks, the looks a player can wear, achievement rarity, and the level fields of views and profiles

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. Рушій: бонуси рівня, оберіг, вимикач, версія стану 22

**Files:**
- Create: `packages/engine/src/perks.ts`, `packages/engine/src/game.perks.test.ts`, `packages/engine/src/views.perks.test.ts`
- Modify: `packages/shared/src/quiz.ts`, `packages/engine/src/game.ts`, `buffs.ts`, `debuffs.ts`, `views.ts`, `restore.ts`, `restore.test.ts`, `index.ts`; `apps/server/src/rooms/manager.answerer.test.ts`, `manager.drafts.test.ts` (лише `toBe(21)` → `toBe(22)`)

**Interfaces:**
- `quiz.ts`: у `quizSettingsSchema` після `awayPenalty` — `levelBonuses: z.boolean().optional()` з коментарем «Бонуси рівнів (беклог 11); немає поля — увімкнено».
- `game.ts`:
  ```ts
  /** Бонуси рівня гравця на цю гру (15a): видані kinds, час «+N с»; used — індекс запитання (questionIndex), на якому бонус узято чи оберіг погасив дебаф. */
  export interface PerkState { kinds: LevelPerk[]; timeMs: number; used: { time?: number; hint?: number; ward?: number } }
  // у GameState: perks?: Record<string, PerkState>;
  ```
- Produces (`packages/engine/src/perks.ts`):
  ```ts
  export function perksOn(state: GameState): boolean; // levelBonuses !== false && !teamsOn(state)
  export function perkFits(quiz: Quiz, kind: LevelPerk): boolean;
  /** Лише для гравців стану без запису; поза lobby/finished; kinds фільтрує perkFits; порожні kinds — без запису. perksOn false — стан без змін. */
  export function grantPerks(state: GameState, grants: Record<string, PerkGrant>): GameState;
  export function perkBlock(state: GameState, playerId: string, kind: ActivePerk, now?: number): PerkBlock | null;
  /** Помилки: not_found, not_allowed (немає видачі цього виду), perk_used, wrong_phase, paused, not_started, already_answered, time_over, perk_unfit. */
  export function usePerk(state: GameState, playerId: string, kind: ActivePerk, now: number): Result;
  export function wardReady(state: GameState, playerId: string): boolean;
  export function spendWard(state: GameState, playerId: string): GameState;
  export function perksView(state: GameState, playerId: string, now?: number): PerksView | null;
  export function wardsView(state: GameState): Record<string, 'ready' | 'spent'> | undefined;
  ```
  - Порядок перевірок `perkBlock`:
    1. `used` (`used[kind] !== undefined`);
    2. `elsewhere` (не `question` або не `buffsHere`);
    3. `answered` (`hasAnswered`);
    4. `not_started` / `time` (лише з `now`, як у `buffBlock`);
    5. `paused`;
    6. `unfit`: `time` — `!timedPlay(play)`; `hint` — `questionFor(state, play, id).hint === undefined` або `buffOf(play, id)?.kind === 'hint'`.
  - `usePerk('time')` → `grantOvertime(state, id, overtimeOf(play, id) + timeMs)`. `'hint'` лише ставить `used.hint`. Текст підказки бере `perksView` з `questionFor`, поки `used.hint === questionIndex`.
- `buffs.ts`, `fitBlock`, гілка `hint`: якщо `state.perks?.[playerId]?.used.hint === state.questionIndex` → `'taken'`.
- `debuffs.ts`:
  - `setDebuff` після всіх наявних перевірок: `wardReady(state, playerId)` → `ok(spendWard(state, playerId))`;
  - `buyDebuff` після `points_short`: коригування −ціна як завжди, далі `wardReady` → `spendWard` замість запису дебафу.
- `views.ts`:
  - `levelBonuses: false` у кожному зрізі, коли вимкнено;
  - `me.perks = perksView(...)`;
  - `wards = wardsView(state)` у зрізах гравця й пульта (лише гравці, що мають `ward` у `kinds`; без жодного — ключа немає);
  - `targets[].warded = wards[id] === 'ready'`.
- `restore.ts`: `GAME_STATE_VERSION = 22` з рядком «22 — 15a: GameState.perks (бонуси рівня), QuizSettings.levelBonuses»; `READABLE_STATE_VERSIONS` з `21` і абзацом «21 → 22 лише додала необов'язкові GameState.perks і QuizSettings.levelBonuses; стан v21 не має бонусів, а вимикач без поля — увімкнено…».
- `restore.test.ts`:
  - `STATE_SHAPE` дістає `'perks'` у `GameState`, `'levelBonuses'` у `QuizSettings`, нові записи `PerkState: 'kinds,timeMs,used'` і `PerkUsed: 'hint,time,ward'`;
  - `KEYS[22]` = `KEYS[21]` + ці ключі;
  - у `representative()` — стан з виданими й використаними бонусами.

- [ ] **Step 1: Write the failing tests:**
  - `game.perks.test.ts` (класичний раунд, `single` з `hint: 'Місто Лева'`, `time: 20`; три гравці; `grantPerks` одразу після `start`):
    - `grantPerks(s, { p1: { kinds: ['time', 'hint', 'ward'], timeMs: 5000 } })` → `s.perks.p1.kinds` усі три. Повтор з іншим `timeMs` нічого не змінює. У лобі (до `start`) → стан без змін.
    - `levelBonuses: false` → `perks` undefined. Командна гра (`teams` у налаштуваннях) → undefined.
    - `perkFits`: вікторина без `hint` → `hint` не видається; `debuffs: []` → `ward` не видається; усі запитання з `video` → `time` не видається.
    - `usePerk(s, 'p1', 'time', now)` на відкритому запитанні → `overtimeOf(play, 'p1') === 5000`. Після бафу `time` (30 000) і тоді бонусу → 35 000. Повтор → `perk_used`.
    - `usePerk('hint')` → `perksView(s, 'p1').hint === 'Місто Лева'`. На наступному запитанні `hint` null, а `items` має `{ kind: 'hint', block: 'used' }`.
    - Баф `hint` узято, тоді `perkBlock(…, 'hint')` → `'unfit'`. Навпаки: бонус `hint`, тоді `buffBlock(…, 'hint')` → `'taken'`.
    - Бонус не займає місця бафу: `usePerk('time')`, тоді `takeBuff('double')` → ok.
    - Бліц-раунд → `perkBlock` `'elsewhere'`, `usePerk` → `wrong_phase`. Пауза → `paused`. Після відповіді → `already_answered`. Відео-запитання → `perk_unfit`. Без видачі → `not_allowed`.
    - Оберіг:
      - `setDebuff(s, 'p1', 'fog')` → ok, `s.debuffs.p1` undefined, `s.perks.p1.used.ward` — число. Другий `setDebuff` → дебаф стоїть.
      - `buyDebuff(s, 'p2', 'p1', 'fog', now)` з готовим оберегом → бал `p2` менший на ціну, дебафу на `p1` немає, оберіг spent. Наступна покупка (новий цикл) → дебаф стоїть.
      - Стан без `perks` → дебафи як до 15a.
  - `views.perks.test.ts`:
    - телефон `p1` з видачею → `me.perks.items` = `[{ kind: 'time', block: null }, { kind: 'hint', block: null }]`, `timeMs: 5000`;
    - без видачі → `me.perks` null;
    - `wards` на пульті й телефоні `{ p1: 'ready' }`, після дебафу `{ p1: 'spent' }`;
    - у крамниці `p2` ціль `p1` має `warded: true`;
    - вимкнено → у всіх зрізах `levelBonuses: false`; увімкнено — ключа немає.
  - `restore.test.ts`: «a version 21 state (no perks, no levelBonuses) restores» — стан з бафом без `perks` проходить `roundTrip(suspend(…))`, `READABLE_STATE_VERSIONS` містить 21, `resume` ok. Стан з `perks` (використаний `time` і оберіг) переживає `roundTrip` і `suspend` без змін.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.perks.test.ts packages/engine/src/views.perks.test.ts packages/engine/src/restore.test.ts` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсами. Обхід усіх запитань вікторини для `perkFits` — наявний помічник shared, якщо є (`grep -n "allSpares\|function.*Questions" packages/shared/src/quiz.ts`). Якщо його немає, у `perks.ts` треба локальний обхід раундів (клітинки поля, раунди з `questions`) + `allSpares(quiz)`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src/rooms
  git commit -m "feat(engine): level perks — a granted +5 s and level hint the player takes once per game beside the 12h buffs, a ward that quenches the first debuff from the host or the shop, the levelBonuses switch, and game state version 22 that still reads 21

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. Сервер: чисті правила досвіду

**Files:**
- Create: `apps/server/src/xp-rules.ts`, `apps/server/src/xp-rules.test.ts`

**Interfaces:**
- Consumes: `AchievementGame`, `AchievementPlayer`, `AchievementRow` з `achievement-games.ts`; `LEVEL_XP` (задача 1).
- Produces (`apps/server/src/xp-rules.ts`):
  ```ts
  export type XpReason = 'few_questions' | 'few_accounts' | 'author' | 'repeat_quiz' | 'cap';
  export interface XpAward {
    userId: string;
    /** До стелі. */
    base: number;
    /** Гра пройшла правила 1–4 (вікторина «з'їдена» для repeat_quiz). */
    counted: boolean;
    reason: Exclude<XpReason, 'cap'> | null;
  }
  /** Один запис на акаунт таблиці (rank !== null; соло — гравець, команда — люди), у порядку players; акаунт двічі — раз. seen(userId) — чи має вже зараховану гру з цією вікториною. */
  export function gameXp(game: AchievementGame, ownerId: string | null, seen: (userId: string) => boolean): XpAward[];
  /** Що лишилось під стелею: amount = min(base, max(0, dailyCap − usedToday)); reason 'cap', якщо урізано. */
  export function capXp(base: number, usedToday: number): { amount: number; capped: boolean };
  /** 'YYYY-MM-DD' за Europe/Kyiv. */
  export function kyivDay(date: Date): string;
  ```

- [ ] **Step 1: Write the failing tests** — `xp-rules.test.ts` з фабрикою `AchievementGame`: 6 запитань, 4 соло-гравці з акаунтами `u1..u4`, ранги 1,2,3,4. У `u1` — 4 правильних (одне з двома спробами бліцу), у `u2` — 2.
  - `gameXp(g, 'owner', () => false)` → `u1.base === 50 + 40 + 100`, `u2 === 50 + 20 + 60`, `u3 === 50 + 0 + 30`, `u4 === 50`; усі `counted`, `reason null`.
  - Нічия: ранги `[1, 1, 3, 4]` → обидва перші +100.
  - `questionsPlayed: 4` → усі `base 0`, `reason 'few_questions'`, `counted false`.
  - Лише 2 акаунти + гість → `few_accounts`. Акаунти `u1, u2, owner` (автор у таблиці, автопілот) → `few_accounts` для всіх, автор — теж `few_accounts` (перше правило перемагає).
  - 4 акаунти, `u4` — автор (`ownerId 'u4'`) → `u4` `author`, решта зараховані.
  - `seen = (id) => id === 'u2'` → `u2` `repeat_quiz`, `counted false`, решта ok.
  - Прибраний (рядок з `rank: null`) не має запису й не рахується до трьох.
  - Командна гра: дві команди, у кожній по 2 акаунти. Рядки команди А: 3 правильних з `answeredBy` = людина А1, 1 правильний з `answeredBy: null`. А1 → `50 + 40 + 100`, А2 → `50 + 10 + 100`.
  - `capXp(250, 400)` → `{ amount: 200, capped: true }`; `capXp(100, 0)` → `{ amount: 100, capped: false }`; `capXp(100, 700)` → `{ amount: 0, capped: true }`.
  - `kyivDay(new Date('2026-07-01T21:30:00Z'))` → `'2026-07-02'` (UTC+3); `kyivDay(new Date('2026-12-31T21:59:00Z'))` → `'2026-12-31'`, а `'2026-12-31T22:00:00Z'` → `'2027-01-01'` (UTC+2).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/xp-rules.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `kyivDay` — `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' })`, як `kyivHour` у `game-achievements.ts`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server/src/xp-rules.test.ts` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src/xp-rules.ts apps/server/src/xp-rules.test.ts
  git commit -m "feat(server): XP rules — 50 for taking part, 10 per correct question and 100/60/30 for the podium, nothing below five questions or three accounts besides the author, nothing for the author or a quiz already counted, and the 600 a day cap by the Kyiv calendar

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. База: журнал досвіду, нарахування, ретро, рівні акаунтів, вбрання

**Files:**
- Create: `apps/server/drizzle/0022_levels.sql` + `meta/0022_snapshot.json`, `_journal.json` (з `apps/server`: `pnpm exec drizzle-kit generate --name levels`), `apps/server/src/xp-store.ts`, `apps/server/src/xp-store.test.ts`
- Modify: `apps/server/src/db/schema.ts`

**Interfaces:**
- `schema.ts` (коментар — беклог 11):
  ```ts
  export const xpEntry = pgTable('xp_entry', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').$type<'game' | 'achievement'>().notNull(),
    /** Без FK: журнал переживає видалення гри. */
    gameId: uuid('game_id'),
    quizId: uuid('quiz_id'),
    achievementId: text('achievement_id').$type<AchievementId>(),
    amount: integer('amount').notNull(),
    counted: boolean('counted').notNull().default(false),
    reason: text('reason').$type<XpReason>(),
    /** kyivDay(at) — для денної стелі. */
    day: text('day').notNull(),
    /** finished_at гри чи earned_at досягнення; null — давнє досягнення без дати. */
    at: at('at'),
    retro: boolean('retro').notNull().default(false),
    createdAt: at('created_at').notNull(),
  }, (table) => [
    uniqueIndex('xp_entry_game_once').on(table.userId, table.gameId).where(sql`source = 'game'`),
    uniqueIndex('xp_entry_achievement_once').on(table.userId, table.achievementId).where(sql`source = 'achievement'`),
    index('xp_entry_user_day_idx').on(table.userId, table.day),
  ]);
  // profile: xpSyncedAt: at('xp_synced_at'), nickColor: text('nick_color').$type<NickColor>(), nickFrame: text('nick_frame').$type<NickFrame>(), badge: text('badge').$type<ProfileBadge>()
  ```
- Produces (`apps/server/src/xp-store.ts`):
  ```ts
  /** Після фінішу: gameXp → для кожного акаунта syncXp (якщо мітки ще немає — це й буде ретро цієї гри), інакше один рядок зі стелею в транзакції з select … for update рядка profile; далі creditAchievements. Незавершена гра — нічого. Збій одного — onError, решта йде далі. */
  export function creditGame(db: Db, gameId: string, onError?: (e: unknown) => void): Promise<void>;
  /** Рядки 'achievement' для всіх user_achievement без рядка, з ACHIEVEMENT_XP за рідкістю; at = earned_at. */
  export function creditAchievements(db: Db, userId: string): Promise<void>;
  /** Без мітки — ретро всіх finished ігор, де користувач у таблиці (хронологічно, без стелі, retro true), далі досягнення й мітка now(). З міткою — наздоганяє ігри після неї без власного рядка, зі стелею; мітка — greatest(…, остання). */
  export function syncXp(db: Db, userId: string, onError?: (e: unknown) => void): Promise<void>;
  export function xpTotals(db: Db, userIds: string[]): Promise<Map<string, number>>;
  /** Для кімнати: syncXp тим, хто без мітки (збій — onError, рівень з наявного), далі NickLevel з looksShown. */
  export function roomLevels(db: Db, userIds: string[], onError?: (e: unknown) => void): Promise<Map<string, NickLevel>>;
  export function ownLevel(db: Db, userId: string): Promise<OwnLevel>; // next — до 3 наступних нагород
  export function publicLevel(db: Db, userId: string): Promise<PublicLevel>;
  export function saveLooks(db: Db, userId: string, looks: NickLooks): Promise<{ ok: true; looks: NickLooks } | { ok: false; error: 'look_locked' }>;
  /** Чисте: мить відкриття кожного досягнутого рівня з рядків журналу за (at, id); null — рядок без дати. */
  export function unlockTimes(entries: { at: Date | null; amount: number }[], level: number): Map<number, Date | null>;
  ```
- Consumes: `loadAchievementGames`, `whoIn` (`achievement-games.ts`), `gameXp` / `capXp` / `kyivDay` (задача 3), `ensureProfile` (`profiles.ts`).

- [ ] **Step 1: Write the failing tests** — `xp-store.test.ts` (`createTestDb`). Помічник `finishedGame(db, { quizId, owner, players: [{ userId, rank, correct }], questions, finishedAt })` вставляє `game`, `participant`, `answer`, за зразком `achievement-store.test.ts`:
  - `creditGame` гри з 4 акаунтами → по рядку на кожного, `xpTotals` = суми з задачі 3. Повтор `creditGame` → рядків не більшає.
  - Мітки ще немає → рядки `retro: true`. Після першого `syncXp` наступна гра пише `retro: false`.
  - Стеля:
    - три гри одного дня по 250 → 250, 250, 100 (`reason 'cap'`);
    - гра наступного дня Києва → знову повна;
    - `Promise.all([creditGame(g1), creditGame(g2)])` по 400 кожна → сума за день рівно 600.
  - Ретро (`syncXp` без мітки) — три давні гри (одна з тією самою вікториною двічі), разом понад 600 за день → стелі немає, повтор вікторини `repeat_quiz`, мітка поставлена.
  - Наздоганяння: мітка є, а пізніше закінчена гра без рядка → `syncXp` пише її зі стелею й переносить мітку.
  - Гонка ретро з живим: `Promise.all([syncXp(u1), creditGame(g)])` → один рядок на `(u1, g)`, `xpTotals` такий самий, як за послідовного виклику.
  - `repeat_quiz` не «з'їдається» грою з `few_accounts`: спершу гра на 2 акаунти (0), тоді на 3 → досвід є.
  - `creditAchievements`: два рядки `user_achievement` (`first_game`, давнє з `earned_at` null; `veteran`) → +25 і +100, `at` null для давнього. Повтор нічого не додає. Досягнення поза стелею: день уже 600, і `creditAchievements` усе одно додає.
  - `unlockTimes([{at: d1, amount: 200}, {at: d2, amount: 100}, {at: d3, amount: 300}], 3)` → `{1: d1, 2: d2, 3: d3}` (280 на d2, 520 на d3).
  - `ownLevel` з 600 XP → `progress.level 3`, `unlocked` має рівні 1–3, `next` — рівні 4–6.
  - `saveLooks`: рівень 1 і `color 'sky'` → `look_locked`; рівень 2 → ok, `publicLevel` віддає `sky`.
  - `roomLevels([u1, guestlessId])`: користувач без жодного рядка → `{ level: 1, color: null, frame: null }`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/xp-store.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - Згенерувати міграцію й додати в SQL коментар `-- Досвід і рівні (беклог 11): журнал нарахувань, мітка ретро, вбрання біля ніку.`, далі `schema.ts`, функції.
  - Ігри користувача для ретро й наздоганяння: `participant.user_id = userId` і `rank is not null`, `game.status = 'finished'`, `order by finished_at, id`. Ігри йдуть пачками через `loadAchievementGames` (як `missedAchievements`).
  - Перевірка `seen` у ретро: зараховані вікторини з бази + ті, що зараховані в цьому проході (у пам'яті).
  - Вставки — `onConflictDoNothing()`.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): XP ledger — migration 0022 adds xp_entry and the profile's sync mark and looks; a finished game credits every account once under the daily cap, achievements once by rarity, old games are replayed in order on the first read, missed ones are caught up, and the chosen looks are checked against the level

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. Кімната: рівні біля ніків, видача бонусів, `player:perk`, замок стікерів

**Files:**
- Create: `apps/server/src/rooms/levels.ts`, `apps/server/src/rooms/manager.levels.test.ts`, `apps/server/src/levels.ts`, `apps/server/src/levels.test.ts`
- Modify: `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/app.ts`

**Interfaces:**
- `Room.levels: Map<string, NickLevel>` (userId → рівень і вбрання) — у літералах `open`, `restore`, `continueSaved`, `restartSaved` (`new Map()`).
- Produces:
  ```ts
  // rooms/levels.ts
  /** Нік людини (соло — гравець, команда — люди) → NickLevel, як titlesView; порожньо — undefined. */
  export function levelsView(room: Room): Record<string, NickLevel> | undefined;
  /** Гравці стану з акаунтом і рівнем у room.levels → perksFor(level); гості й без рівня — нічого. */
  export function perkGrants(room: Room): Record<string, PerkGrant>;
  // manager.ts
  setLevels(room: Room, levels: Map<string, NickLevel>): void; // оновити, syncPerks, changed — лише якщо щось змінилось
  usePerk(room: Room, playerId: string, kind: ActivePerk): AckResult;
  // приватне: syncPerks(room) = state ← grantPerks(state, perkGrants(room)); кличеться в start, у join після старту і в setLevels
  // src/levels.ts
  export function attachLevels(manager: RoomManager, db: Db, onError?: (e: unknown) => void): { idle(): Promise<void> }; // як attachTitles, але через roomLevels
  ```
- `react(room, by, item)`: для `by !== 'host'` і стікера — `stickerOpen(item.value, room.levels.get(room.playerUsers.get(by) ?? '')?.level ?? null)`. Інакше `{ ok: false, error: 'sticker_locked' }` до запису частоти.
- Зрізи всіх ролей: `levels` поряд із `prizes` / `titles` (там, де зараз `titlesView`).
- `socket.ts`: `on('player:perk', …)` за зразком `player:react`, з `perkSchema` → `manager.usePerk`.
- `app.ts`: `attachLevels(manager, db)` поряд з `attachTitles`, а `idle()` — туди ж, куди `idle` титулів (тести й зупинка).

- [ ] **Step 1: Write the failing tests:**
  - `manager.levels.test.ts` (`RoomManager` + `FakeScheduler`, вікторина з `hint` і таймером, дебафи типові):
    - `setLevels(room, { u1: { level: 12, color: 'sky', frame: 'bronze' } })`, Оля (`u1`) у лобі → зріз сцени `levels` = `{ Оля: { level: 12, color: 'sky', frame: 'bronze' } }`, гість без запису. До старту `state.perks` undefined.
    - Старт → `state.perks[олі id].kinds` = `['time', 'hint']`, `timeMs 5000`.
    - Рівень прийшов після старту: `setLevels` з рівнем 15 для Петра → видано `['time', 'hint', 'ward']`. Повторний `setLevels` з рівнем 20 → `timeMs` лишається 5000 (видача одна).
    - Пізній гравець з акаунтом після старту: `join`, тоді `setLevels` → видано.
    - `levelBonuses: false` → після старту й `setLevels` `perks` undefined.
    - `usePerk(room, olya, 'time')` на запитанні → ok, повтор → `perk_used`.
    - `react` стікером `nyas` від гравця рівня 3 → `sticker_locked`; рівня 6 → ok; від гостя `nya` → ok, `nyaa` → `sticker_locked`; від `'host'` `other` → ok.
    - Командна кімната: `levels` за ніками людей, а `perks` немає.
  - `levels.test.ts` (за зразком `titles.test.ts`): `attachLevels` на `changed` питає `roomLevels` раз на акаунт. Збій → `onError`, а на наступному `changed` питає ще раз. Закрита кімната не отримує `setLevels`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/rooms/manager.levels.test.ts apps/server/src/levels.test.ts` → FAIL.
- [ ] **Step 3: Implement** за інтерфейсами.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): levels in the room — every view carries the level and looks next to each nickname, account players get their level perks at the start or as soon as the level arrives, player:perk takes +5 s or the level hint, and a sticker above the player's level is refused

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Рекордер і профіль: нарахування після гри, рівень у профілі, вбрання

**Files:**
- Create: `apps/server/src/recorder.levels.test.ts`
- Modify: `apps/server/src/recorder.ts`, `apps/server/src/profiles.ts`, `apps/server/src/profiles.test.ts`, `apps/server/src/profile-routes.ts`, `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- `recorder.ts`: після блоку призів — `if (state.phase === 'finished' && !credited.has(room.id)) { await creditGame(db, room.id, onError); credited.add(room.id); }`. `credited` — `Set<string>` поряд з `awarded` / `prized`, і `forget` її чистить. Коментар: «Досвід — останнім (15a): збій іде в повтор, а що не вдалося, наздожене syncXp».
- `profiles.ts`:
  - `ownProfile` спершу кличе `syncXp(db, current.id)` (збій → `console.error`, профіль усе одно віддається), далі `level: await ownLevel(db, id)`;
  - `publicProfile` → `level: await publicLevel(db, id)` (без `syncXp`: чужий профіль базу не переписує, як 12i для чужої сторінки).
- `profile-routes.ts`: `PUT /api/me/looks`, тіло `looksSchema`. 401 без входу, 400 невалідне, 409 `{ error: 'look_locked' }`, 200 `{ looks }`.

- [ ] **Step 1: Write the failing tests:**
  - `recorder.levels.test.ts` (за зразком `recorder.prizes.test.ts`): кімната з 3 акаунтами, 5 запитань, до `finished` → `xp_entry` має 3 рядки `game`.
    - Збій першого `creditGame` (підмінений `db` кидає один раз) → повтор черги дописує, і рядків рівно 3.
    - Гра, що не дійшла до `finished` (`closed` у лобі), рядків не має.
    - `creditGame` іде після `awardGame`: на мить нарахування в `user_achievement` уже є `first_game`, і рядок `achievement` для нього теж записано.
  - `profiles.test.ts`:
    - власний профіль користувача з двома давніми іграми (без мітки) → `level.progress.xp` > 0, мітка поставлена;
    - чужий профіль → `level.level` і `looks`, без мітки (ретро не запускав).
  - `profile-routes.test.ts`:
    - `PUT /api/me/looks` гостем → 401;
    - `{ color: 'pink' }` → 400;
    - рівень 1 і `sky` → 409 `look_locked`;
    - після 300 XP (рядок журналу напряму) `sky` → 200, `GET /api/profiles/:id` → `level.looks.color === 'sky'`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/recorder.levels.test.ts apps/server/src/profiles.test.ts apps/server/src/profile-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement**, а тимчасові значення задачі 1 в `profiles.ts` замінити справжніми.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): XP after the game — the recorder credits a finished game last in its queue with the same retries, the own profile replays old games once and shows level, progress and unlocked rewards, the public one shows level and looks, and PUT /api/me/looks wears what the level has opened

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Веб: нік з рівнем, кольором, рамкою й титулом

**Files:**
- Create: `apps/web/src/screens/Nick.tsx`, `apps/web/src/screens/Nick.test.tsx`
- Modify: `apps/web/src/screens/StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx`, `Standings.tsx`, `StageTeams.tsx` (+ їхні тести, лише за списком «Навмисних змін»), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Produces:
  ```tsx
  /** Нік людини: колір і рамка з levels, «Рів. N» (лише з рівнем), титул 14a; без levels і titles — просто нік. */
  export function Nick(props: { nickname: string; levels?: Record<string, NickLevel>; titles?: Record<string, string> }): JSX.Element;
  ```
- Розмітка:
  ```html
  <span class="nick nick-f-{frame}">
    <span class="nick-name nick-c-{color}">…</span>
    <span class="nick-level" aria-label="{t('levelAria')}">…</span>
    <span class="nick-title">…</span>
  </span>
  ```
  Класи кольору й рамки ставляться лише з не-null значенням.
- Заміни: п'ять місць із `.nick-title` (`StageScreen.tsx:110`, `PlayerScreen.tsx:846`, `HostScreen.tsx:1254`, `Standings.tsx:38`, `StageTeams.tsx:26`). `Standings` і `StageTeams` дістають проп `levels?`, і кожен виклик передає `levels={view.levels}` поряд з `titles={view.titles}`. У `Standings` правило те саме: лише коли `teams === null`.
- Тексти: `levelBadge` «Рів. {n}», `levelAria` «Рівень {n}».
- Стилі:
  - `.nick-name` з `text-overflow: ellipsis`, `min-width: 0`; `.nick-level` — маленький бейдж, `flex-shrink: 0`;
  - 7 кольорів (`rainbow` — градієнт `background-clip: text`), 6 рамок (`outline` / `box-shadow` навколо `.nick`, `fire` і `neon` — тінню, без анімації, якщо `prefers-reduced-motion`).

- [ ] **Step 1: Write the failing tests:**
  - `Nick.test.tsx`:
    - `levels: { Оля: { level: 12, color: 'sky', frame: 'bronze' } }`, `titles: { Оля: '👑 Король' }` → текст «Рів. 12», клас `nick-c-sky` на імені, `nick-f-bronze` на обгортці, титул «👑 Король»;
    - нік без записів → лише нік, без `.nick-level`;
    - `color: null` → немає класу `nick-c-*`.
  - `Standings.test.tsx`: рядок соло з `levels` → «Рів. 3» поряд із ніком; командна таблиця → без рівня в рядку команди.
  - `StageTeams.test.tsx`: людина команди з рівнем → «Рів. 7».
  - `PlayerScreen.test.tsx` (лобі `lobby: ['Оля', 'Петро']`, `levels: { Оля: … }`) → «Рів. 12» біля Олі й нічого біля Петра.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/Nick.test.tsx apps/web/src/screens/Standings.test.tsx apps/web/src/screens/StageTeams.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement** компонент, заміни, тексти, стилі.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): one Nick for every list — the level badge, the worn nick colour and frame and the 14a title next to the nickname in the lobby, stage, host and phone tables and team rosters

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 8. Веб: бонуси рівня на телефоні, 🛡 на пульті й у крамниці

**Files:**
- Create: `apps/web/src/screens/Perks.tsx`, `apps/web/src/screens/Perks.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `DebuffShop.tsx`, `HostPlayerTools.tsx` (+ `DebuffShop.test.tsx`, `HostPlayerTools.test.tsx`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- Produces:
  ```tsx
  /** Ряд під рядом бафів: кнопки items, текст підказки, стан оберегу; emit — 'player:perk'. */
  export function Perks(props: { perks: PerksView | null; ward: 'ready' | 'spent' | undefined; onUse: (kind: ActivePerk) => void }): JSX.Element | null;
  ```
- Поведінка:
  - кнопка «⏱ +{s} с» (`timeMs / 1000`) і «💡 Підказка рівня»; `disabled`, коли `block !== null`, з `title` = `t('perkBlock_' + block)`;
  - `perks.hint` → картка «💡 {hint}»;
  - `ward === 'ready'` → чип «🛡 Оберіг»;
  - перехід `ready → spent` поки компонент змонтовано → одноразове «🛡 Оберіг погасив дебаф» (локальний `useRef` попереднього стану, 4 с);
  - `perks === null` і `ward === undefined` → `null`.
- `PlayerScreen` монтує `Perks` там само, де ряд бафів (`me.buffs`), а також поза запитанням, коли є оберіг (чип у шапці телефона). `ward = view.wards?.[me.id]`.
- `DebuffShop`: ціль з `warded` → «🛡» після ніку й `aria-label` з `t('shopWarded')`.
- `HostPlayerTools` (і рядок гравця на пульті, де насилають дебаф): `view.wards?.[id] === 'ready'` → «🛡».
- Тексти:
  - `perkTime` «⏱ +{s} с», `perkHint` «💡 Підказка рівня», `perkWard` «🛡 Оберіг», `perkWardSpent` «🛡 Оберіг погасив дебаф»;
  - `perkBlock_used` «Уже використано в цій грі», `perkBlock_unfit` «Тут не діє», `perkBlock_answered`, `perkBlock_time`, `perkBlock_paused`, `perkBlock_elsewhere`, `perkBlock_not_started`;
  - `shopWarded` «має оберіг: перший дебаф згасне»;
  - `err_perk_used`, `err_perk_unfit`.

- [ ] **Step 1: Write the failing tests:**
  - `Perks.test.tsx`:
    - два items без блоку → дві кнопки, клік «⏱ +5 с» → `onUse('time')`;
    - `timeMs 10000` → «+10 с»;
    - `block 'used'` → кнопка `disabled` з «Уже використано в цій грі»;
    - `hint: 'Місто Лева'` → «💡 Місто Лева»;
    - `ward` `'ready'` → «🛡 Оберіг»; перерендер зі `'spent'` → «🛡 Оберіг погасив дебаф»;
    - усе порожнє → нічого.
  - `PlayerScreen.test.tsx`: зріз запитання з `me.perks` → клік емітить `player:perk` з `{ kind: 'hint' }`.
  - `DebuffShop.test.tsx`: ціль з `warded: true` → «🛡».
  - `HostPlayerTools.test.tsx`: `wards: { p1: 'ready' }` → «🛡» біля p1.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/Perks.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/DebuffShop.test.tsx apps/web/src/screens/HostPlayerTools.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, а ряд бонусів у CSS переноситься на новий рядок (`flex-wrap`), щоб разом із рядом бафів 12h влазити в 375 px.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): level perks on the phone — +5 s and the level hint as buttons under the 12h buffs with the reason when they are off, the ward chip and its «погасив дебаф» moment, and the 🛡 next to warded players for the host and in the debuff shop

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 9. Веб: замкнені стікери, вимикач бонусів, рядок у лобі

**Files:**
- Modify: `apps/web/src/screens/ReactionSheet.tsx` (+ тест), `apps/web/src/editor/PowersEditor.tsx` (+ тест), `apps/web/src/help/settings.ts` (+ `host-help.test.ts`, якщо він перелічує налаштування), `apps/web/src/screens/HostScreen.tsx`, `AuthorLobby.tsx`, `PlayerScreen.tsx` (+ тести), `apps/web/src/i18n.ts`

**Interfaces:**
- `ReactionSheet` дістає проп `level: number | null`. Закритий стікер (`!stickerOpen(id, level)`) — сіра клітинка з 🔒, `aria-label` = `t('stickerLocked', { level: seriesLevel(series) })`, без `onPick`. Серце «улюблене» лишається. Закриті улюблені — так само з 🔒. Швидкі емодзі завжди відкриті.
- `PlayerScreen` передає `level={view.levels?.[myNickname]?.level ?? null}`. Пульт `ReactionSheet` (ведучий) передає `level={Infinity}`, тож усе відкрите.
- `PowersEditor`: прапорець «Бонуси рівнів» (`levelBonusesLabel`) з поясненням `levelBonusesHint` «+5 с, підказка й оберіг для гравців з рівнем 5+. Вимкни для чесної гри без переваг.». Позначено, коли `settings.levelBonuses !== false`. Зняти → `levelBonuses: false`, поставити → ключ прибрано.
- Лобі:
  - пульт і `AuthorLobby` — рядок `levelBonusesOn` «Бонуси рівнів увімкнено» або `levelBonusesOff` «Бонуси рівнів вимкнено»;
  - телефон — лише коли `view.levelBonuses === false`: «Бонуси рівнів вимкнено ведучим».
- `help/settings.ts`: пункт про «Бонуси рівнів».
- Тексти: `stickerLocked` «Відкриється з рівня {level}», `err_sticker_locked` «Цей стікер відкриється з вищим рівнем».

- [ ] **Step 1: Write the failing tests:**
  - `ReactionSheet.test.tsx`:
    - `level 1` → стікер `nyaa…` має «Відкриється з рівня 3» і клік не викликає `onPick`, а стікер `nya…` клікається;
    - `level null` → те саме, що 1;
    - улюблений закритий → 🔒;
    - `level Infinity` → усі клікаються.
  - `PowersEditor.test.tsx`: вікторина без ключа → прапорець позначено. Зняти → `onChange` з `levelBonuses: false`, поставити знову → без ключа.
  - `HostScreen.test.tsx` / `AuthorLobby.test.tsx`: лобі з `levelBonuses: false` → «Бонуси рівнів вимкнено», без ключа → «увімкнено».
  - `PlayerScreen.test.tsx`: лобі з `levelBonuses: false` → «Бонуси рівнів вимкнено ведучим».
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/ReactionSheet.test.tsx apps/web/src/editor/PowersEditor.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/screens/AuthorLobby.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): stickers open with levels and show 🔒 «Відкриється з рівня N» until then, the host keeps all of them, the quiz editor gets the «Бонуси рівнів» switch, and the lobbies say whether level bonuses are on

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 10. Веб: розділ «Рівень» у профілі, вбрання, рівень у чужому профілі

**Files:**
- Create: `apps/web/src/profile/LevelCard.tsx`, `apps/web/src/profile/LevelCard.test.tsx`
- Modify: `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/PublicProfile.tsx` (+ тести), `apps/web/src/api.ts`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `api.ts`: `saveLooks(looks: NickLooks): Promise<{ looks: NickLooks }>` (`PUT /api/me/looks`, 409 → помилка з кодом `look_locked`).
- Produces:
  ```tsx
  /** Власний профіль: рівень, шкала, правила досвіду, відкрите з датами, 3 наступні, вибір вбрання. */
  export function LevelCard(props: { level: OwnLevel; nickname: string; onSaved: (looks: NickLooks) => void }): JSX.Element;
  ```
- Зміст:
  - заголовок «Рівень {n}»;
  - `<progress>` від `levelAt` до `nextAt`, підпис «{xp} / {nextAt} досвіду»;
  - рядок правил `xpRules` «Досвід дають ігри, де щонайменше 3 гравці з акаунтами й 5 запитань. За свою вікторину й повторну гру тієї самої — ні. До 600 на добу; досягнення — понад це.»;
  - список відкритого (рівень, назва нагороди `t('reward_' + kind, …)`, дата `dd.mm.yyyy` або «давно»);
  - «Далі»: 3 наступні з «з рівня N»;
  - три групи вибору (радіо): колір ніку (з «Без кольору»), рамка (з «Без рамки»), значок (з «Без значка»). Лише відкрите, з прев'ю `Nick`. «Зберегти» → `saveLooks`.
- Профіль: у шапці `Profile` і `PublicProfile` біля ніку — значок (`looks.badge`) і `Nick`-бейдж «Рів. N». `LevelCard` — у `Profile` після «Статистики», перед «Нагородами». `PublicProfile` показує лише рівень і значок, без шкали.
- Тексти нагород:
  - `reward_stickers` «Стікери «{series}»»;
  - `reward_color` «Колір ніку: {name}» з `color_<id>` (Небо, М'ята, Сонце, Корал, Фіалка, Золото, Веселка);
  - `reward_frame` «Рамка: {name}» з `frame_<id>` (Бронза, Срібло, Золото, Неон, Вогонь, Веселка);
  - `reward_badge` «Значок {id}»;
  - `reward_perk` з `perk_time` / `perk_hint` / `perk_ward`;
  - `reward_perk_boost` «+5 с стає +10 с».

- [ ] **Step 1: Write the failing tests:**
  - `LevelCard.test.tsx`:
    - рівень 3 з 600 XP → «Рівень 3», «600 / 800 досвіду»;
    - відкрите — 3 рядки, давній з «давно»;
    - «Далі» — «з рівня 4»;
    - група кольору має «Небо» (відкрито з 2-го) і не має «М'ята»;
    - вибір «Небо» → «Зберегти» → `saveLooks` з `{ color: 'sky', frame: null, badge: null }`, далі `onSaved`;
    - 409 → текст `err_look_locked`.
  - `Profile.test.tsx`: профіль з `level` → розділ «Рівень» і «Рів. 3» у шапці.
  - `PublicProfile.test.tsx`: чужий з `looks.badge: '⭐'` → «⭐» і «Рів. 5», без шкали.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile/LevelCard.test.tsx apps/web/src/pages/Profile.test.tsx apps/web/src/pages/PublicProfile.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — компонент, вставки, тексти й стилі (групи вибору — сітка, що переноситься, без прокрутки вбік на 375 px).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web
  git commit -m "feat(web): «Рівень» in the profile — the level and bar to the next one, how XP is earned, every unlocked reward with its date and the next three, and the colour, frame and badge to wear; the public profile shows the level and the badge

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 11. Наскрізний сценарій 15a

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `afterSplash`, `pickOption`, `shot`, `snapshot`, `expectNoSideScroll`, `problems`, `classicRound`, `makeRoundsQuiz`, `boolQ`, `single`, `db` (PGlite сценарію).
- Сід рівнів — пряма вставка в `xp_entry` через `db` (`source 'game'`, `gameId` випадковий uuid, `counted false`, `day` вчора). Так рівні готові без десятків ігор:
  - Оля — 3200 (рівень 10: «+5 с», «Підказка рівня», стікери до `other`);
  - Петро — 5900 (рівень 15: ще й «Оберіг»);
  - Ірина — 0.
  - Перед вставкою кожен уже раз відкрив `/profile`: мітка ретро поставлена, тож сід не переграється.
- Вікторина «Рівнева вікторина 15a» — один класичний раунд «Розминка», `time: 20`, `speedBonus: false`, `shuffleOptions: false`, дебафи типові (`fog` серед них), п'ять запитань (правильна — перша, «так»/«ні» змішані):
  1. `single` «Яка річка тече через Київ?» (Дніпро, Дністер, Південний Буг, Десна), `hint: 'Найдовша річка України'`;
  2. `boolean` «Говерла — найвища вершина України?» → «так»;
  3. `boolean` «Чорне море — прісне?» → «ні»;
  4. `single` «Яке місто стоїть на семи пагорбах над Дніпром?» (Київ, Харків, Полтава, Чернігів);
  5. `boolean` «Карпати лежать на сході України?» → «ні».
- Екрани:
  - пульт 1280 × 800 (`host15a`, акаунт, автор вікторини);
  - сцена 1280 × 720 (`stage15a`);
  - Оля (`olya15a`), Петро (`petro15a`), Ірина (`iryna15a`) — акаунти, 375 × 812;
  - Гість (`guest15a`), 375 × 812.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 14a:
  ```ts
  it('part 15a: levels — Оля (level 10) and Петро (level 15) wear their level badges, nick colour and frame in the lobby and tables, Оля takes +5 s and the level hint, Петро's ward quenches the host's debuff, Ірина sees locked sticker series, the finished game credits XP to the three accounts but not to the host-author or the guest, a second game of the same quiz gives nothing, and the switch in the editor turns level bonuses off', async () => {
    try {
      await levels15a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `levels15a()`:**
  1. **Сід і вбрання.**
     - Реєстрація ведучого, Олі, Петра, Ірини; кожен відкриває `/profile` (мітка ретро).
     - Вставка сіду в `xp_entry`.
     - Оля на `/profile`: «Рівень 10», шкала «3200 / 3650 досвіду» (`xpForLevel(11)` = 3650 — у тесті береться з `xpForLevel`, не літералом). Колір «Небо», рамка «Бронза», значок ⭐ → «Зберегти».
     - `expectNoSideScroll(olya, 'p15a-profile')`, кадр `p15a-profile`.
  2. **Лобі.**
     - Вікторина через `POST /api/quizzes`, «Грати», сцена. `join` Олі, Петра, Ірини (з акаунтами) і Гостя.
     - Сцена: «Рів. 10» біля Олі, клас `nick-c-sky`, «Рів. 15» біля Петра, біля Гостя бейджа немає. Кадр `p15a-stage-lobby`.
     - Пульт: «Бонуси рівнів увімкнено».
     - Телефон Олі: `expectNoSideScroll(olya, 'p15a-phone-lobby')`.
  3. **Бонуси.**
     - «Почати гру» → «Почати раунд» → запитання 1. Телефон Олі: «💡 Підказка рівня» → «💡 Найдовша річка України»; «⏱ +5 с» → кнопка стає `disabled`. Кадр `p15a-phone-perks`, `expectNoSideScroll(olya, 'p15a-phone-perks')`.
     - Пульт бачить 🛡 біля Петра й насилає йому «Туман». Телефон Петра: «🛡 Оберіг погасив дебаф» і немає `.debuff-fog` (клас дебафу туману, як у наявних сценаріях 9c). Кадр `p15a-phone-ward`.
     - Відповіді: Оля «Дніпро», Петро «Дніпро», Ірина «Десна», Гість «Дністер» → розкриття → «Далі». Запитання 2–5 — Оля всі правильно, Петро 2 і 4, Ірина 3, Гість жодного. Наприкінці «Завершити гру» не потрібне: після 5-го — «Далі» до фіналу.
  4. **Стікери.** На фіналі Ірина відкриває аркуш реакцій: стікер серії `nyaa` має «Відкриється з рівня 3» і не клікається, а стікер `nya` відправляється (сцена показує реакцію). Кадр `p15a-stickers`, `expectNoSideScroll(iryna, 'p15a-stickers')`.
  5. **Досвід.**
     - Чекати, поки рекордер допише (`expect.poll` на `GET /api/me/profile` Ірини, де `level.progress.xp > 0`).
     - Перевірки:
       - рядки `source 'game'` у `xp_entry` за цю гру: Оля 200 (`50 + 50 + 100`), Петро 140 (`50 + 30 + 60`), Ірина 90 (`50 + 10 + 30`), усі `counted`, `reason null`;
       - досягнення перевіряються лише відносно: кожен рядок `source 'achievement'` Ірини має `amount === ACHIEVEMENT_XP[achievementRarity(id)]`, і серед них є `first_game`. Точний набір ачівок (час доби тощо) тест не фіксує;
       - ведучий-автор: рядка `game` за цю гру немає (він не в таблиці);
       - гість — поза журналом.
     - Оля `/profile` → кадр `p15a-profile-after`.
  6. **Повтор вікторини.** Друга гра тієї самої вікторини з тими самими трьома акаунтами, усі відповідають. Рядки `xp_entry` за другу гру мають `reason 'repeat_quiz'` і `amount 0` для всіх трьох.
  7. **Вимикач.**
     - Ведучий у редакторі знімає «Бонуси рівнів», «Зберегти».
     - Нова гра: пульт «Бонуси рівнів вимкнено», телефон Олі «Бонуси рівнів вимкнено ведучим». На запитанні 1 ряду «⏱ +5 с» немає, а «Туман» на Петра діє (`.debuff-fog`). Кадр `p15a-off`.
     - Гру закрити.
  8. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 15a"` → PASS. Переглянути кадри `p15a-*`:
  - нік + рамка + «Рів. N» + титул не виштовхують бали за край на 375 px;
  - ряд бонусів під бафами — без прокрутки;
  - сцена 1280 × 720 без прокрутки;
  - розділ «Рівень» — одна колонка.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані:** `npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо 9b/12r (перезапуски з версією стану 22), 9c (крамниця дебафів без оберегів), 13a (реакції гостей стікерами `nya`), 14a (титули біля ніків). Якщо не вистачає пам'яті, прогнати групами за `-t` і сказати про це у звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 15a end-to-end — level badges, nick colour and frame in the lobby and tables, +5 s and the level hint on Оля's phone, Петро's ward quenching the host's fog, Ірина's locked sticker series, XP for the three accounts and none for the author or the guest, nothing for a repeated quiz, and level bonuses off by the editor switch

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
