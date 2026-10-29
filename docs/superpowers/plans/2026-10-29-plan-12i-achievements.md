# План 12i: ачівки I — окреме меню, значки, жарти, прогрес, 32 нові

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 12i специфікації `docs/superpowers/specs/2026-10-27-subproject-12-design.md`:
- розділ 13 (уся частина);
- обмеження — розділи 2 і 3 (анти-ціль «будь-який новий вміст (ачівки, жарти, тексти e2e) не містить тем росії чи СРСР»; телефон 375 px, сцена 1280 × 720; тон «ти», коротко);
- рядок 12i у таблиці частин — розділ 4 (стан гри без змін, міграція бази);
- розділ 14 (12j) — **лише як межа**: 12i не робить антиачівок, ачівок механік 12c–12h, «Нова ачівка!» в кінці гри й `profile.hide_anti`, але кладе під них основу (див. «Основа для 12j»).

**Рішення власника (з розділу 13):** у меню є пункт «🏅 Ачівки» між «Історією» і «Профілем»; сторінка з групами, картками (значок, назва, жарт, умова дрібним шрифтом, дата) і прогресом для лічильних; профіль показує рядок значків; дата отримання лежить у новій таблиці `user_achievement`; уже отримані до деплою записуються з `earned_at = null` («давно»); розрахунок лишається в `achievements.ts`. Власник дозволив будівельникові рішення там, де специфікація лишає місце; вони зібрані нижче в розділі «Рішення».

Що робить частина:
- **Каталог:** 16 наявних ачівок отримують значок, жарт і групу; додаються **всі 32** рядки таблиці «30 нових» (разом із запасними `author_hit` і `veteran`) — разом **48**. Порядок і групи — у спільному `packages/shared/src/achievements.ts`; значки й тексти — у вебі.
- **Меню:** «🏅 Ачівки» (`/achievements`) між «Історією» і «Профілем», лише для тих, хто увійшов.
- **Сторінка `/achievements`:** угорі «Отримано 23 з 48»; групи «Перші кроки», «Влучність», «Швидкість», «Формати», «Бафи й дебафи», «Компанія», «Ведучий і автор» (група «Антиачівки» є в каталозі, але порожня й схована до 12j); картка — значок, назва, жарт, умова дрібним шрифтом, «Отримано 29 жовтня 2026» чи «Отримано давно»; неотримана — сіра, а лічильна — з поступом «37 / 50».
- **Чужа сторінка `/profile/:id/achievements`:** лише отримані, без прогресу, заголовок «Ачівки: Оля».
- **Профіль** (свій і публічний): рядок значків — останні 8 отриманих і «ще 15 →», що веде на сторінку ачівок.
- **Дата отримання:** таблиця `user_achievement (user_id, achievement_id, earned_at, game_id)`. Коли гра закінчилась, сервер рахує ачівки учасників з акаунтами (а також ведучого й автора вікторини) і дописує нові з датою фінішу і грою. Першого разу для кожного користувача він доповнює таблицю з усієї історії з `earned_at = null`.
- **Нові дані запису гри** (для умов, яких база не мала): дебаф, під яким дано відповідь, номер підказки «Хто я?», людина команди, що відповідала. Старі ігри цих даних не мають — відповідні ачівки за них просто не рахуються.
- **Гра без ведучого:** автор-гравець — звичайний гравець; «За пультом» (`host`) за гру автопілота не дається (як і зараз: `hosted` рахує лише `autopilot = false`).
- **Команди:** ачівки за місце й результат (`team_win`, перемоги, п'єдестал, «Мільйонер», «Ва-банк», «Вибування», дуель, час гри, марафон) отримує кожна людина команди; ачівки за відповіді — лише та людина, що відповідала (12g) чи натиснула в бліці; без цих даних (старі командні ігри) — ніхто.
- **Довідка ведучого** не потрібна: сторінка ачівок сама показує умови.

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 21, `READABLE_STATE_VERSIONS` — `[2..21]`, `restore.test.ts` без змін.**
- Ачівки рахуються з історії в базі. Нові дані запису (дебаф, підказка, відповідач) рекордер бере з уже наявного стану (`state.debuffs[…].firedAt`, `Play.clueOpens` / `cluesAnswered`, `Play.buzzers`, `answererOf`), нових полів стану не потрібно.
- Деплой живих ігор не обриває; згода власника на пуш через версію стану не потрібна. Діє лише правило «Push hold while playing».

**Міграція бази `0017_achievements`** (лише додає):
- таблиця `user_achievement` (`user_id` → `user.id` каскадом, `achievement_id text`, `earned_at timestamptz null`, `game_id uuid null` → `game.id` `on delete set null`, ключ `(user_id, achievement_id)`);
- `profile.achievements_synced_at timestamptz null` — позначка «історію цього користувача вже доповнено»;
- `answer.debuff text null`, `answer.clue integer null`, `answer.answered_by uuid null` (без зовнішнього ключа: рядки команд пишуться раніше за рядки людей).

**Архітектура:**
- **Shared.**
  - Новий `achievements.ts`: `ACHIEVEMENTS` (48, переїжджає з `profile.ts`), `AchievementId`, `ACHIEVEMENT_GROUPS`, `ACHIEVEMENT_INFO` (група й мета лічильника), `PROFILE_BADGES = 8`, типи `Achievement`, `AchievementCard`, `AchievementsPage`.
  - `profile.ts`: імпортує `Achievement` з `achievements.ts`; `OwnProfile.achievements` і `PublicProfile.achievements` — `Achievement[]` з `earnedAt`.
- **Рушій.**
  - `answerer.ts`: `answeredByOf(state, index, teamId)`.
  - `debuffs.ts`: `debuffOn(state, index, playerId)`.
- **Сервер.**
  - `drizzle/0017_achievements.sql` + `meta`; `db/schema.ts`: `userAchievement`, `profile.achievementsSyncedAt`, `answer.debuff / clue / answeredBy`.
  - `recorder.ts`: три нові поля рядка `answer` (з `coalesce` під час повторного запису); після запису завершеної гри — `awardGame`.
  - Новий `achievement-games.ts`: `loadAchievementGames(db, gameIds)` → `AchievementGame[]` (усе, що треба умовам однієї гри, кількома запитами на пачку ігор).
  - Новий `game-achievements.ts`: чиста `gameAchievements(game, who)` — 26 умов однієї гри; `kyivHour`.
  - `achievements.ts`: `AchievementFacts` → `CareerFacts` (+6 лічильників), `careerEarned`, `careerProgress`; 22 «кар'єрні» умови.
  - Новий `achievement-store.ts`: `careerFacts`, `syncAchievements`, `awardGame`, `achievementsPage`.
  - `history.ts`: експорт `snapshotOf` і `playedQuestions`; новий `answeredTypes(db, userId)` (SQL).
  - `profiles.ts`: `profileFacts` бере ачівки зі сховища; `profile-routes.ts`: `GET /api/me/achievements`, `GET /api/profiles/:id/achievements`.
  - `testing/history-rows.ts`: `seedGame` уміє `plays`, `finishedAt`, `payload`, `timeMs`, нові поля й команди.
- **Веб.**
  - Новий `achievement-meta.ts` (значки), `achievements.ts` (`recentBadges`, `groupCards`); `i18n.ts` (назви, жарти, умови, групи, тексти сторінки); `format.ts` (`formatDay`).
  - Новий `pages/Achievements.tsx` (свій і чужий вигляд), `AppRoutes.tsx`, `menu/Menu.tsx`, `api.ts`.
  - `profile/AchievementList.tsx` → рядок значків `AchievementStrip`; `pages/Profile.tsx`, `pages/PublicProfile.tsx`; `styles.css`.
- **Наскрізні тести.** Один сценарій «part 12i: …»: гра з «Швидкими пальцями», сторінка ачівок на телефоні 375 × 812 і на 1280 × 800, рядок значків, чужа сторінка. Кадри `p12i-`. Плюс навмисні правки старих перевірок профілю (див. «Порядок збирання»).

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

## Рішення

*Каталог і тексти*
- **Будуємо всі 32 рядки** таблиці «30 нових», зокрема запасні `author_hit` і `veteran`: дані для кожної умови є або додаються цією частиною. Разом 16 + 32 = **48**. 12j додасть 22 (68 + 2 запасні = 70).
- **Порядок `ACHIEVEMENTS`:** 16 наявних у теперішньому порядку, потім 32 нові в порядку таблиці специфікації. Сторінка показує їх групами, у групі — у порядку `ACHIEVEMENTS`.
- **Тексти без роду.** Правило власника — тексти без роду (більшість гравців — жінки), тож назви-«особи» й жарти з минулим часом («відповів», «переміг», «лишився») переписано. Значки — зі специфікації. Остаточні тексти (`name` · жарт · умова):

  | id | Значок | Назва | Жарт | Умова |
  |---|---|---|---|---|
  | first_game | 🎈 | Перша гра | Ласкаво просимо! Назад дороги немає. | Зіграти першу гру з акаунта |
  | first_win | 🏆 | Перша перемога | Смак перемоги: трохи солодкий, трохи зарозумілий. | Посісти перше місце в грі |
  | games_10 | 🔟 | 10 ігор | Це вже не випадковість, це хобі. | Зіграти 10 ігор |
  | streak_5 | 🔥 | Серія 5 правильних | П'ять поспіль — і жодного «ой». | Відповісти правильно на 5 запитань поспіль в одній грі |
  | perfect_game | 💎 | Ідеальна гра | Жодної помилки. Підозріло. Хтось, перевірте кишені! | Гра без жодної помилки, щонайменше 5 запитань |
  | host | 🎤 | За пультом | Перша гра по той бік пульта. Тепер ти знаєш, як це. | Провести першу гру |
  | games_50 | 🎖️ | 50 ігор | Вікторина вже впізнає тебе в обличчя. | Зіграти 50 ігор |
  | wins_10 | 👑 | 10 перемог | Корона не тисне? | Перемогти 10 разів |
  | games_100 | 💯 | 100 ігор | Сотня. Час повісити рамку на стіну. | Зіграти 100 ігор |
  | host_10 | 📣 | Досвід за пультом | Десять ігор — і «Далі» майже завжди вчасно. | Провести 10 ігор до кінця |
  | streak_10 | 🌋 | Серія 10 правильних | Вулкан знань. Обережно, гаряче. | Відповісти правильно на 10 запитань поспіль в одній грі |
  | win_streak_3 | 🎩 | Три перемоги поспіль | Хет-трик. Друзі вже змовляються проти тебе. | Перемогти в трьох завершених іграх поспіль |
  | blitz_win | ⚡ | Корона бліцу | Пальці швидші за думку. Іноді це навіть допомагає. | Набрати в бліц-раунді більше балів, ніж будь-хто інший |
  | final_hit | 💰 | Влучна ставка | Ставку зроблено — і вона зіграла. | Правильно відповісти у фіналі з ненульовою ставкою |
  | comeback | 🔄 | Камбек | Списали з рахунків? Даремно. | Перемогти, коли перед останнім раундом хтось мав більше балів |
  | friends_5 | 🫂 | Компанія друзів | П'ятеро друзів — уже маленький фан-клуб. | Зіграти з п’ятьма різними друзями (за весь час) |
  | fast_answer | 🏎️ | Швидкі пальці | Відповідь є, а запитання ще не дочитане. Сміливо! | Правильна відповідь швидше ніж за 2 с |
  | fast_10 | 🚀 | Реактивна швидкість | Десять разів швидше за звук. Ну, майже. | 10 правильних відповідей швидше ніж за 3 с в одній грі |
  | last_second | ⏳ | На останній секунді | Драма до останньої секунди. Глядачі в захваті. | Правильна відповідь, коли лишалося не більше 1 с |
  | sniper | 🎯 | Снайперська точність | Дев'ять із десяти. Десятому запитанню просто не пощастило. | Щонайменше 90 % правильних у грі з 10 і більше твоїми запитаннями |
  | eagle_eye | 🦅 | Око орла | На мапі знайдено те, чого не знайде навігатор. | Точка на мапі з повною ціною |
  | jeweler | 💍 | Ювелірна точність | Точно в ціль, до одиниці. | Повзунок чи число без жодного відхилення |
  | clairvoyant | 🔮 | Ясновидіння | Відгадка з першої підказки. Точно без підглядання? | «Хто я?» правильно з першої підказки |
  | wall_clean | 🧱 | Стіна впала | Чотири групи, нуль помилок — і стіна впала. | Стіна без жодної помилки |
  | sort_clean | 🗂️ | Перфекціонізм | Усе по поличках, як у бабусі в серванті. | Сортування без жодної помилки |
  | chain_full | ⛓️ | Ланцюгова реакція | Слово за словом — і жодної підказки. | Ланцюжок до кінця без підказок |
  | survey_top | 📊 | Голос народу | Думаєш, як усі. Це комплімент. | Влучити в найпопулярнішу відповідь «100 до 1» |
  | lone_genius | 🧠 | Самотня зірка | Знання на одну людину. Решта аплодує стоячи. | Єдина правильна відповідь, коли відповідали щонайменше 4 |
  | bluff_master | 🎭 | Мистецтво блефу | Твою вигадку вибрали троє. Акторська школа плаче. | Твою вигадку вибрали щонайменше 3 гравці на одному запитанні |
  | lie_detector | 🕵️ | Детектор брехні | Тебе не проведеш. Навіть не пробуй. | Знайти правду в усіх блефах гри (щонайменше 3) |
  | ladder_top | 💸 | Верхівка драбини | Драбину пройдено до верху. На що витратимо? | Верхня сходинка «Мільйонера» |
  | wipeout_bank | 🏦 | Ризиковий банк | Банк донесено до кінця — і жодна монетка не впала. | Донести банк «Ва-банк» до кінця раунду |
  | last_hero | 🏝️ | Останній бастіон | Усі вибули, а ти ще тут. Самотньо, зате красиво. | Дожити до кінця «Вибування», коли хтось інший вибув |
  | duelist | 🤺 | Дуель за тобою | Один на один — і перемога твоя. | Виграти дуель |
  | board_owner | 🗺️ | Поле твоє | Можна ставити паркан. І табличку з ім'ям. | Правильно відповісти на 5 своїх клітинок поля за гру |
  | all_rounds | 🧩 | Усі раунди | Зіграно все, що придумали. | Зіграти раунди всіх типів (за весь час) |
  | all_types | 📚 | Колекція форматів | Усі типи запитань позаду. Здивувати тебе важко. | Відповісти на запитання всіх типів (за весь час) |
  | buff_gourmet | 🍱 | Баф-дегустація | Усе з меню бафів скуштовано. | Щонайменше 4 різні бафи в одній грі |
  | double_jackpot | ✌️ | Подвійна радість | «Подвійні бали» на клітинці ×3. Бухгалтер у шоці. | «Подвійні бали» й правильна відповідь на клітинці ×2 чи ×3 |
  | prankster | 😈 | Капості | Десять дебафів для друзів. Друзі пам'ятають. | Купити 10 дебафів (за весь час) |
  | unbreakable | 🦾 | Незламність | Туман, бруд, тремтіння — а відповідь усе одно влучна. | 3 правильні відповіді під дебафом в одній грі |
  | team_win | 🤝 | Командний дух | Перемога на всіх. Лаври — теж. | Перемога в командній грі |
  | night_owl | 🦉 | Нічна сова | Хто вночі вікторини грає, той удень… теж грає. | Гра закінчилася між 0:00 і 5:00 за київським часом |
  | early_bird | 🐦 | Жайворонок | Кава ще не охолола, а гра вже йде. | Гра почалася між 5:00 і 8:00 за київським часом |
  | marathon | 🏃 | Марафон | П'ятдесят запитань за раз. Ноги не затекли? | Гра з щонайменше 50 запитаннями |
  | podium_10 | 🥉 | П'єдестал — як дім | П'єдестал уже тримає для тебе місце. | 10 разів у трійці |
  | author_hit | 📖 | Бестселер | За твоїми вікторинами зіграно 10 ігор. Автограф, будь ласка. | 10 завершених ігор за твоїми вікторинами |
  | veteran | 🛡️ | 250 ігор | 250 ігор. Ти тут живеш? | Зіграти 250 ігор |

  - Перейменовано: «Ведучий» → «За пультом», «Досвідчений ведучий» → «Досвід за пультом», «Король бліцу» → «Корона бліцу», «Реактивний» → «Реактивна швидкість», «Снайпер» → «Снайперська точність», «Ювелір» → «Ювелірна точність», «Ясновидець» → «Ясновидіння», «Майстер стіни» → «Стіна впала», «Перфекціоніст» → «Перфекціонізм», «Самотній геній» → «Самотня зірка», «Майстер блефу» → «Мистецтво блефу», «Мільйонер» → «Верхівка драбини», «Ризиковий банкір» → «Ризиковий банк», «Останній герой» → «Останній бастіон», «Дуелянт» → «Дуель за тобою», «Господар поля» → «Поле твоє», «Універсал» → «Усі раунди», «Колекціонер форматів» → «Колекція форматів», «Баф-гурман» → «Баф-дегустація», «Капосник» → «Капості», «Незламний» → «Незламність», «Командний гравець» → «Командний дух», «Марафонець» → «Марафон», «Завсідник п'єдесталу» → «П'єдестал — як дім», «Автор бестселера» → «Бестселер», «Ветеран» → «250 ігор». Назви «Детектор брехні», «Нічна сова», «Жайворонок» лишаються: це предмет чи тварина, а не рід людини.
  - Умови наявних 16 — теперішні `achievementHint_*`, лише `streak_5` і `streak_10` без слова «поспіль» у назві (воно лишається в умові).
- **Групи** (`ACHIEVEMENT_GROUPS`, у такому порядку): `start` «Перші кроки», `accuracy` «Влучність», `speed` «Швидкість», `formats` «Формати», `powers` «Бафи й дебафи», `company` «Компанія», `host` «Ведучий і автор», `anti` «Антиачівки».
  - `start`: first_game, first_win, games_10, games_50, games_100, veteran, wins_10, win_streak_3, podium_10, comeback, marathon, night_owl, early_bird (13);
  - `accuracy`: streak_5, streak_10, perfect_game, sniper, eagle_eye, jeweler, clairvoyant, lone_genius, survey_top (9);
  - `speed`: fast_answer, fast_10, last_second, blitz_win (4);
  - `formats`: final_hit, wall_clean, sort_clean, chain_full, bluff_master, lie_detector, ladder_top, wipeout_bank, last_hero, duelist, board_owner, all_rounds, all_types (13);
  - `powers`: buff_gourmet, double_jackpot, prankster, unbreakable (4);
  - `company`: friends_5, team_win (2);
  - `host`: host, host_10, author_hit (3);
  - `anti`: порожня до 12j; сторінка не показує порожніх груп.
- **Лічильні** (мають `goal` і поступ на сторінці): games_10 (10), games_50 (50), games_100 (100), veteran (250), wins_10 (10), host_10 (10), podium_10 (10), prankster (10), author_hit (10), friends_5 (5), streak_5 (5), streak_10 (10), win_streak_3 (3), all_rounds (`ROUND_TYPES.length` = 7), all_types (`QUESTION_TYPES.length` = 17). Решта — «разові», без поступу. *(Рішення плану: специфікація каже «8 різних типів раундів», але типів раундів сім — `ROUND_TYPES`; ціль береться з переліку, тож новий тип раунду сам підніме її.)*

*Два рівні розрахунку*
- **Кар'єрні (22):** 16 наявних + veteran, podium_10, prankster, author_hit, all_rounds, all_types. Рахуються щоразу дешевими запитами (`playerGames`, `gameTables`, кілька `count`), як і зараз у `profileFacts`. Логіка 16 наявних не змінюється.
- **Ігрові (26):** fast_answer, fast_10, last_second, sniper, eagle_eye, jeweler, clairvoyant, wall_clean, sort_clean, chain_full, survey_top, lone_genius, bluff_master, lie_detector, ladder_top, wipeout_bank, last_hero, duelist, board_owner, buff_gourmet, double_jackpot, unbreakable, team_win, night_owl, early_bird, marathon. Їм потрібні знімок вікторини, журнал `plays` і відповіді (`payload`) — це дорого читати на кожен перегляд профілю. Тому їх рахують **один раз на гру**: коли гра закінчилась (`awardGame`), і один раз на користувача — під час доповнення історії. Результат лежить у `user_achievement`.
- *(Рішення плану: специфікація пропонувала дописати поля в `TableRow`; ігрові умови натомість мають власний завантажувач `AchievementGame`, бо `gameTables` навмисно не читає знімка й відповідей, а профіль мусить лишатися швидким. `TableRow` не змінюється.)*
- Ігрові ачівки дають лише **завершені** ігри (`status = 'finished'`). Перервана гра (`aborted`) їх не дає; її продовження (12r, рядки `'carry'`) — звичайна гра.
- **Перервані й продовжені ігри (12r).** Лічильники ігор (`games_*`, `veteran`) рахують кожну участь, як статистика профілю «Ігор»: поступ «37 / 50» завжди збігається з профілем, і ніхто не втрачає вже показаних ачівок. Продовження після перерваної гри — окрема гра в історії, тож це чесно. *(Рішення плану.)*

*Сховище й дати (`achievement-store.ts`)*
- `user_achievement` — назавжди: отримане не зникає, навіть якщо факти змінилися (відписка від друга тощо).
- **Доповнення історії** (раз на користувача, коли `profile.achievements_synced_at` порожнє): ігрові умови по всіх його завершених іграх від найстарішої (пачками по 20) і кар'єрні — з `earned_at = null`, `game_id` — перша гра, що дала ачівку (для кар'єрних — null); потім позначка `achievements_synced_at = now()`. Повторний паралельний виклик нешкідливий (`onConflictDoNothing`).
- **Фініш гри** (`awardGame(db, gameId)`): користувачі — учасники з акаунтами (гравці соло й люди команд), ведучий (`host`, `host_10`) і власник вікторини (`author_hit`). Для кожного: доповнення історії (без цієї гри), ігрові умови цієї гри й кар'єрні — нові пишуться з `earned_at = game.finishedAt` і `game_id`. Повертає `Map<userId, AchievementId[]>` щойно отриманих (12j покаже їх як «Нова ачівка!»).
- **Читання** (профіль, сторінки): доповнення історії, якщо треба; кар'єрні, яких ще немає в таблиці (наприклад, `friends_5` після нової підписки), пишуться з `earned_at = now()` і `game_id = null`.
- Рядки з невідомим `achievement_id` (якщо колись ачівку приберуть) читання пропускає.
- **Рекордер** кличе `awardGame` у тій самій черзі запису після збереження завершеної гри, раз на кімнату (`awarded`). Збій — як збій запису: журнал і повтор (повторний `awardGame` нічого не дублює).

*Умови однієї гри (`game-achievements.ts`, усі пороги — у `ACHIEVEMENT_LIMITS`)*
- «Свої рядки»: соло — рядки учасника; людина команди — рядки команди з `answeredBy` = id її рядка-людини; старі командні ігри (`answeredBy` null) — нічого. Рядок-відповідь — `attempt ≥ 0`; рядок мовчання з «Ризиком» (`PENALTY_ATTEMPT` з `buff: 'risk'`) — відповідь лише для `sniper` і `buff_gourmet`.
- **Обсяг:** `answer` — fast_answer, fast_10, last_second, sniper, eagle_eye, jeweler, clairvoyant, wall_clean, sort_clean, chain_full, survey_top, lone_genius, bluff_master, lie_detector, board_owner, buff_gourmet, double_jackpot, unbreakable (за своїми рядками); `outcome` — ladder_top, wipeout_bank, last_hero, duelist, team_win, night_owl, early_bird, marathon (за учасником, тобто вся команда). *(Рішення плану: дуелянта бази не знає, тож дуель — результат команди.)*
- Умови:
  - `fast_answer`: свій прийнятий рядок, `0 < timeMs < 2000`, у запитання справжній час (`limitMs !== null`).
  - `fast_10`: ≥ 10 різних запитань гри зі своїм прийнятим рядком `0 < timeMs < 3000` і `limitMs !== null`.
  - `last_second`: свій прийнятий рядок, `limitMs !== null`, `timeMs ≤ limitMs` і `limitMs − timeMs ≤ 1000`.
  - `sniper`: знаменник — запитання зі своєю відповіддю (рядок `attempt ≥ 0` чи мовчання з «Ризиком») плюс, лише соло, запитання з балами в класичних і фінальних раундах (не клітинки поля, не бліц), де свого рядка немає (мовчання — промах); чисельник — запитання з прийнятим своїм рядком; знаменник ≥ 10 і частка ≥ 0,9. *(Рішення плану: «гра з ≥ 10 запитаннями» прочитано як «≥ 10 твоїх запитань», інакше гравець, що слухав пів гри, мав би «точність» за чужі запитання.)*
  - `eagle_eye`: свій прийнятий рядок на основному запитанні `pin` (без `spareId`), `checkAnswer(question, payload).accuracy ≥ 1 − 1e-9`.
  - `jeweler`: свій рядок на основному `slider` чи `numeric`, `|payload.value − question.correct| ≤ 1e-9`.
  - `clairvoyant`: свій прийнятий рядок на основному `clues`, підказка 1: `clue === 1`, а для старого рядка без `clue` — лише запитання з таймером підказок поза полем (`!isSelfPaced`, без клітинки) і `cluesAt(question, timeMs) === 1`.
  - `wall_clean`: свій рядок з `payload.type === 'wall'`, `mistakes === 0` і `found === groups`.
  - `sort_clean`: `payload.type === 'sort'`, `misses === 0` і `sorted === total`.
  - `chain_full`: `payload.type === 'chain'`, `hints === 0` і всі приховані слова розгадано (`solved === question.words.length − 1`; виконавець звіряє з `scoreChain` і пише у звіті, якщо `solved` рахує інакше).
  - `survey_top`: `payload.type === 'survey'` і серед `payload.rows` є id рядка з найбільшою `popularity` (перший за порядком при рівності) у `ref.surveyRows ?? question.rows`.
  - `lone_genius`: запитання з балами, не бліц і не клітинка поля; основні рядки `attempt 0` без `spareId` дали ≥ 4 різні учасники (`FACT_LIMITS.geniusAnswers`); прийнятий рівно один — і він свій.
  - `bluff_master`: свій рядок з `bluffFact(payload).fooled ≥ 3`.
  - `lie_detector`: у грі ≥ 3 запитання `bluff`, і на кожному є свій рядок з `bluffFact(payload).truth === true`.
  - `ladder_top`: у `plays` є `ladder.contestant === participantId` з `outcome.kind === 'top'`.
  - `wipeout_bank`: у раунді «Ва-банк», де є `wipeout.end`, `wipeoutStandings([id], steps, true)[id]` має `status 'survived'` і `bank > 0` (кроки — як у `unplayedWipeout` в `history.ts`: ціна запитання, свої прийняті рядки `attempt 0`, `wipeout.took`).
  - `last_hero`: у раунді «Вибування», де є `survival.end`, учасник серед `survivorsAfter(усі учасники, outs раунду)`, а `outs` не порожні. *(Рішення плану: жарт «усі вибули» — хтось мусив вибути, інакше ачівку давав би раунд без вибування.)*
  - `duelist`: коригування учасника з `source 'duel'` і `points > 0`.
  - `board_owner`: ≥ 5 різних клітинок (не бліц-клітинок), де `cell.chooserId === participantId` і є свій прийнятий рядок (відповідь на запасне теж).
  - `buff_gourmet`: ≥ 4 різні `buff` серед своїх рядків (з мовчанням «Ризику»).
  - `double_jackpot`: свій прийнятий рядок з `buff 'double'` на клітинці з позначкою ×2 чи ×3.
  - `unbreakable`: ≥ 3 різні запитання зі своїм прийнятим рядком і `debuff !== null`.
  - `team_win`: командна гра й `isWin` команди.
  - `night_owl`: `finishedAt !== null` і `kyivHour(finishedAt) < 5`.
  - `early_bird`: `5 ≤ kyivHour(startedAt) < 8`. *(Умова специфікації — лише час початку, без перемоги; жарт не обіцяє перемоги.)*
  - `marathon`: `questionsPlayed ≥ 50`.
- `kyivHour(date)`: `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: '2-digit', hourCycle: 'h23' })`; якщо ICU не знає `Europe/Kyiv` (`RangeError`), — `Europe/Kiev`.

*Кар'єрні лічильники (`CareerFacts`, нове)*
- `podium` — `podium.first + second + third` з `podiumStats` (уже рахується для статистики).
- `debuffsBought` — рядки `score_adjustment` з `source 'debuff'` власних соло-учасників користувача. *(Рішення плану: у командній грі купує капітан, але база записує покупку на команду без людини — такі покупки не рахуються.)*
- `authorGames` — завершені ігри, чий `game.quiz_id` належить вікторині користувача (`quiz.owner_id`), хоч хто їх вів, зокрема автопілот. Ігри видалених вікторин не рахуються.
- `roundTypes` — кількість різних `table.roundTypes[row.roundIndex]` серед рядків-відповідей і штрафів (не коригувань) свого учасника (`mine` з `profileFacts`).
- `questionTypes` — `answeredTypes(db, userId).size`: різні типи основних запитань (без `spareId`), де є рядок користувача (соло — свій; голос опитування чи «хмари» — рядок людини; відповідь команди — рядок команди з `answered_by` = рядок людини); `AWAY_ATTEMPT` не рахується. Тип береться в SQL з `game.plays` і знімка (`rounds[i].questions[*]` і `rounds[i].categories[*].cells[*].question`), без читання всього знімка в Node; старі ігри без `plays` не дають типів.
- Поступ: `games_*`, `veteran` ← `games`; `wins_10` ← `wins`; `host_10` ← `hosted`; `podium_10` ← `podium`; `prankster` ← `debuffsBought`; `author_hit` ← `authorGames`; `friends_5` ← `friendsPlayedWith`; `streak_5`, `streak_10` ← `bestStreak`; `win_streak_3` ← `winStreak`; `all_rounds` ← `roundTypes`; `all_types` ← `questionTypes`; `current = min(значення, goal)`.

*Нові дані запису (рекордер, з наявного стану)*
- `answer.debuff` — `debuffOn(state, index, playerId)`: `state.debuffs[playerId]?.firedAt === index ? kind : null` (у командній грі `playerId` — команда). Дебаф «згорає» на відкритті наступного запитання, а останнє закрите запитання рекордер переписує ще раз; тому повторний запис не затирає вже записане (`coalesce(excluded.debuff, answer.debuff)`). Кімната, перезапущена між закриттям запитання і записом, втрачає цей дебаф (рідкісна прогалина).
- `answer.clue` — `cluesAnswered(play, question, record.timeMs, playerId)` для основного `clues` (без `record.spare`); інакше null. Стан тримає `Play.clueOpens` назавжди, тож запис точний.
- `answer.answered_by` — лише рядки команд: `answeredByOf(state, index, teamId)` = `play.buzzers?.[teamId]` (бліц — хто натиснув), інакше для поточного запитання (`index === state.questionIndex`) — `answererOf(state, teamId)`, інакше null; повторний запис — `coalesce`. Соло й рядки людей — null.
- На рядках спроб бліцу: `debuff` — як у запитання, `clue: null`, `answered_by` — `play.buzzers?.[teamId]`. Рядки штрафів і `AWAY_ATTEMPT`: `clue` і `answered_by` null, `debuff` — як у запитання (для 12j).

*API й форма даних*
- `Achievement { id; earned; earnedAt: string | null }` — профіль (свій і публічний) віддає **усі 48** з позначками, як і зараз (ключ `achievements` той самий; додається `earnedAt`). Так старі перевірки `achievements.find(...).earned` і ключі публічного профілю лишаються чинними.
- `GET /api/me/achievements` → `AchievementsPage` (усі 48, поступ для лічильних); без входу — 401.
- `GET /api/profiles/:id/achievements` → `AchievementsPage` лише з отриманими, `progress: null` (і для власника — публічний вигляд, як публічний профіль); невідомий — 404; обмеження частоти як у `/api/profiles/:id`.
- `AchievementsPage { profile: ProfileCard; own: boolean; earned: number; total: number; items: AchievementCard[] }`, `total = ACHIEVEMENTS.length`.

*Веб*
- Меню: `ACHIEVEMENTS_ITEM = { label: 'menuAchievements', icon: '🏅', to: '/achievements', active: under('/achievements') }` між `HISTORY` і `PROFILE`. На телефоні нижня панель на п'ять кнопок 375 px без горизонтальної прокрутки. `PROFILE` лишається активним на `/profile/:id/achievements` (це частина профілю іншої людини).
- Сторінка: сітка карток — одна колонка до 560 px, далі `repeat(auto-fill, minmax(16rem, 1fr))`; неотримана — `.is-locked` (сіра: `filter: grayscale(1)`, `opacity: .6`) з `<progress>` і «37 / 50» для лічильних; дата — `formatDay(iso)` («29 жовтня 2026», без часу) у часовому поясі браузера. Анімацій немає (рух не потрібен).
- Рядок значків: `ul.achievements.achievement-strip`, кожен `li` — значок (`aria-hidden`) і назва в `.sr-only` (тож `hasText` старих e2e знаходить назву), `title` — назва. Останні 8 отриманих: `earnedAt` спадно, `null` («давно») — після датованих, при рівності — за порядком `ACHIEVEMENTS`. Далі посилання «ще N →» (якщо отриманих > 8) чи «Усі ачівки →». Без отриманих — «Ще жодної ачівки» і «Усі ачівки →».
- Свій профіль веде на `/achievements`, публічний — на `/profile/:id/achievements`.

*Основа для 12j (робимо зараз)*
- група `anti` в каталозі (порожня; сторінка ховає порожні групи);
- `awardGame` повертає щойно отримані ачівки кожного користувача;
- `answer.debuff` (для `debuff_magnet`: на рядках, що є), `answer.clue` (`own_pace`, `who_am_i`), `answer.answered_by` (`chosen_one`);
- `AchievementGame` легко доповнити апеляціями й рядками `AWAY_ATTEMPT` (12j).

*Чого не робимо*
- антиачівок, ачівок механік 12c–12h, «Нова ачівка!» на телефоні й сцені, `profile.hide_anti` (усе — 12j);
- рідкості ачівок і таблиці лідерів (не-ціль специфікації);
- зміни статистики профілю (зокрема подвійного рахунку перерваних і продовжених ігор);
- нового демо-вмісту. Тексти e2e — без тем росії й СРСР.

## Глобальні обмеження

- **Анти-ціль:** живі ігри не обриваються деплоєм. Стан гри не змінюється (`GAME_STATE_VERSION` 21), міграція лише додає таблицю й стовпці.
- **Анти-ціль:** сума рядків гравця в базі дорівнює рахунку. Нові стовпці балів не змінюють; рекордер не додає й не прибирає рядків (задача 3).
- **Анти-ціль:** тексти без тем росії й СРСР. Приклади e2e — Дніпро, Чернівці, Буковина.
- **Тексти без роду:** «ти» в теперішньому часі, безособові форми, без «відповів / відповіла», «переміг / перемогла».
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`.
- Сторінка ачівок і профіль: телефон 375 px без горизонтальної прокрутки, нижнє меню з п'ятьма кнопками; на 1280 px — кілька колонок карток.
- Профіль має лишатися швидким: на читання — ті самі дешеві запити, що й зараз, плюс один `select` з `user_achievement` і три `count`; дорогий завантажувач ігор — лише на фініші гри й під час одноразового доповнення.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=1 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- Наскрізні тести: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12i"`.
  - **Лише на передньому плані.** Жодного запуску у фоні: команда йде в тому самому кроці, а результат читається одразу.
  - Затримка 11b в e2e увімкнена. Кнопки пульта чекають, доки стануть активними, без снів.
  - Кадри лежать в `apps/server/e2e/artifacts/shots`, префікс — `p12i-`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp
  ```
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (правило пам'яті «Push after work»; версія стану не змінюється). Якщо власник саме грає (правило «Push hold while playing»), пуш чекає.

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/achievements.ts` (новий), `achievements.test.ts` (новий), `profile.ts`, `index.ts` | каталог, групи, лічильники, типи | 1 |
| `apps/web/src/achievement-meta.ts` (новий), `achievements.ts` (новий), `achievements.test.ts` (новий), `i18n.ts`, `format.ts`, `format.test.ts` | значки, тексти, впорядкування | 2 |
| `apps/server/drizzle/0017_achievements.sql` + `meta`, `src/db/schema.ts`, `src/db/schema.test.ts`; `packages/engine/src/answerer.ts`, `debuffs.ts`, `answerer.test.ts`, `game.debuffs.test.ts`; `apps/server/src/recorder.ts`, `recorder.test.ts`, `testing/history-rows.ts` | міграція, нові дані запису | 3 |
| `apps/server/src/achievement-games.ts` (новий), `achievement-games.test.ts` (новий), `game-achievements.ts` (новий), `game-achievements.test.ts` (новий), `history.ts` (експорти) | завантажувач, умови часу й влучності | 4 |
| `apps/server/src/game-achievements.ts`, `game-achievements.formats.test.ts` (новий), `achievement-games.test.ts` | умови форматів і сил | 5 |
| `apps/server/src/achievements.ts`, `achievements.test.ts`, `achievement-store.ts` (новий), `achievement-store.test.ts` (новий), `history.ts` (`answeredTypes`), `profiles.ts`, `profiles.test.ts`, `profile-routes.ts`, `profile-routes.test.ts`, `recorder.ts`, `recorder.test.ts` | лічильники, сховище, фініш гри, API | 6 |
| `apps/web/src/pages/Achievements.tsx` (новий), `Achievements.test.tsx` (новий), `AppRoutes.tsx`, `AppRoutes.test.tsx`, `menu/Menu.tsx`, `menu/Menu.test.tsx`, `api.ts`, `i18n.ts`, `styles.css` | сторінка, меню | 7 |
| `apps/web/src/profile/AchievementList.tsx` → `AchievementStrip.tsx`, `profile/profile.test.tsx`, `pages/Profile.tsx`, `Profile.test.tsx`, `pages/PublicProfile.tsx`, `PublicProfile.test.tsx`, `i18n.ts`, `styles.css` | рядок значків у профілі | 8 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 12i, правки старих перевірок профілю | 9 |

## Порядок збирання

- 1 → 2 (веб-тексти на каталозі) і 1 → 3 → 4 → 5 → 6 (сервер по черзі: 4 і 5 правлять той самий `game-achievements.ts`, 6 спирається на 3–5). Задачі 7 і 8 — після 2 і 6 (форма API), між собою по черзі (спільні `i18n.ts`, `styles.css`). Задача 9 — останньою.
- Між задачами 3 і 6 нові стовпці вже пишуться, а ачівок за ними ще ніхто не рахує: проміжні коміти не деплояться, мердж — один.
- **Навмисні зміни наявних очікувань** (лише такі):
  - **`packages/shared/src/profile.ts` (задача 1):** `ACHIEVEMENTS`, `AchievementId`, `Achievement` переїжджають в `achievements.ts` (реекспорт через `index.ts`, імпорти `@quiz/shared` не змінюються); `Achievement` отримує `earnedAt`. Фікстури з літеральними `{ id, earned }` (`apps/web/src/pages/Profile.test.tsx`, `PublicProfile.test.tsx`, `profile/profile.test.tsx`, серверні тести профілю) отримують `earnedAt: null` — і кожен файл, на який вкаже `pnpm typecheck`;
  - **`apps/web/src/i18n.ts` (задача 2):** `achievement_host` «Ведучий» → «За пультом», `achievement_host_10` → «Досвід за пультом», `achievement_blitz_win` → «Корона бліцу», `achievement_streak_5` / `_10` без «поспіль»; тести, що шукають старі назви (`profile.test.tsx`, `Profile.test.tsx`), — на нові;
  - **`apps/server/src/achievements.test.ts` (задача 6):** `achievementsOf(facts)` → `careerEarned(facts)` (масив id); фікстура `zero` отримує нові лічильники (`podium: 0, debuffsBought: 0, authorGames: 0, roundTypes: 0, questionTypes: 0`); очікування для 16 наявних не змінюються;
  - **`apps/server/src/profiles.test.ts`, `profile-routes.test.ts` (задача 6):** `achievements` тепер з `earnedAt`; перевірки `earned` не змінюються; кількість — 48 замість 16;
  - **`apps/web/src/profile/profile.test.tsx`, `Profile.test.tsx`, `PublicProfile.test.tsx` (задача 8):** список з 16 рядків і `🔒` → рядок значків лише отриманих; перевірки «ще не отримано» переїжджають у `Achievements.test.tsx`;
  - **`apps/web/src/menu/Menu.test.tsx` (задача 7):** пунктів для того, хто увійшов, п'ять: «Приєднатися» … «Історія», «Ачівки», «Профіль»;
  - **e2e (задача 9):**
    - `part 6…` профіль Олі (рядок `getByLabel('10 ігор (ще не отримано)', exact)`) → у рядку значків немає «10 ігор»: `expect(await olya.locator('.achievements li', { hasText: '10 ігор' }).count()).toBe(0)`;
    - профіль ведучого: `hasText: 'Ведучий'` → `hasText: 'За пультом'`;
    - «Нові ачівки» (`.achievements li` — `toBe(16)`, кадр `achievements-16-phone`) → `toBeLessThanOrEqual(8)`, кадр `achievements-strip-phone`;
    - `part 7e` (`'Влучна ставка'` у профілі Петра) — без змін; якщо в Петра понад 8 ачівок і її немає в рядку, — перевірка йде на `/achievements` (`.achievement-card:not(.is-locked)`), і виконавець пише це у звіті;
    - перевірки API (`achievements.find(...).earned`, ключі публічного профілю) — без змін.
  - Якщо падає інше, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові

1. **Тексти.** 48 значків, назв, жартів і умов; без роду (жодного «-в» / «-ла» минулого часу про гравця); без тем росії й СРСР; групи покривають кожну ачівку рівно раз (задачі 1, 2).
2. **Умови.** Кожна з 26 ігрових — на штучній грі «так» і «ні», зокрема межі (2000 мс, 1000 мс, 90 %, 4 відповіді, 3 обдурені); старі ігри без нових стовпців не ламають розрахунку (задачі 4, 5).
3. **Команди.** Ачівки за відповіді — лише людині з `answered_by`; за результат — усій команді; стара командна гра без `answered_by` — нічого за відповіді (задачі 3–5).
4. **Дати.** Доповнення історії — `null`, фініш гри — `finishedAt` гри, читання — `now()` лише для кар'єрних; отримане не зникає; повтор нічого не дублює (задача 6).
5. **Швидкість профілю.** Завантажувач ігор не викликається на читанні після доповнення (задача 6).
6. **Запис.** Нові стовпці не змінюють балів і рядків; повторний запис не затирає `debuff` і `answered_by` (задача 3).
7. **Приватність.** Чужа сторінка — лише отримані, без прогресу; анонім не бачить `/api/me/achievements` (задачі 6, 7).
8. **Вигляд.** Сторінка на 375 px — одна колонка, без горизонтальної прокрутки; на 1280 px — кілька колонок; нижнє меню з п'ятьма кнопками вміщається; рядок значків не ширший за екран. Кадри `p12i-*` (задачі 7–9).

---

### Задача 1. Каталог: 48 ачівок, групи, лічильники, типи сторінки

**Files:**
- Create: `packages/shared/src/achievements.ts`, `packages/shared/src/achievements.test.ts`
- Modify: `packages/shared/src/profile.ts`, `packages/shared/src/index.ts` (`export * from './achievements';`)
- Test: `achievements.test.ts`; фікстури `Achievement` — усе, на що вкаже `pnpm typecheck`

**Interfaces:**
- `packages/shared/src/achievements.ts`:
  ```ts
  import { QUESTION_TYPES, ROUND_TYPES } from './quiz';
  import type { ProfileCard } from './profile';

  /** Усі ачівки: 16 перших (до 12i) у старому порядку, потім 32 нові (12i) у порядку специфікації. */
  export const ACHIEVEMENTS = [
    'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
    'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
    'fast_answer', 'fast_10', 'last_second', 'sniper', 'eagle_eye', 'jeweler', 'clairvoyant', 'wall_clean',
    'sort_clean', 'chain_full', 'survey_top', 'lone_genius', 'bluff_master', 'lie_detector', 'ladder_top', 'wipeout_bank',
    'last_hero', 'duelist', 'board_owner', 'all_rounds', 'all_types', 'buff_gourmet', 'double_jackpot', 'prankster',
    'unbreakable', 'team_win', 'night_owl', 'early_bird', 'marathon', 'podium_10', 'author_hit', 'veteran',
  ] as const;
  export type AchievementId = (typeof ACHIEVEMENTS)[number];

  /** Групи сторінки ачівок у порядку показу; anti — антиачівки 12j (у 12i порожня). */
  export const ACHIEVEMENT_GROUPS = ['start', 'accuracy', 'speed', 'formats', 'powers', 'company', 'host', 'anti'] as const;
  export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

  /** Група й ціль лічильника (null — разова ачівка без поступу). */
  export const ACHIEVEMENT_INFO: Record<AchievementId, { group: AchievementGroup; goal: number | null }> = { /* за «Рішеннями» */ };

  /** Скільки останніх значків показує профіль. */
  export const PROFILE_BADGES = 8;

  /** Ачівка в профілі: earnedAt — ISO-мить отримання; null — не отримано або отримано «давно» (до 12i). */
  export interface Achievement {
    id: AchievementId;
    earned: boolean;
    earnedAt: string | null;
  }

  /** Картка сторінки ачівок: поступ лише для лічильних неотриманих на своїй сторінці. */
  export interface AchievementCard extends Achievement {
    progress: { current: number; goal: number } | null;
  }

  /** Сторінка ачівок: own — свій вигляд (усі з поступом); інакше лише отримані. */
  export interface AchievementsPage {
    profile: ProfileCard;
    own: boolean;
    earned: number;
    total: number;
    items: AchievementCard[];
  }
  ```
  - `all_rounds.goal = ROUND_TYPES.length`, `all_types.goal = QUESTION_TYPES.length`; решта цілей — числами з «Рішень».
  - Циклічний імпорт `profile.ts` ↔ `achievements.ts` — лише `import type`, тож безпечний.
- `profile.ts`: прибрати `ACHIEVEMENTS`, `AchievementId`, `Achievement`; `import type { Achievement } from './achievements';`.

- [ ] **Step 1: Write the failing tests** (`achievements.test.ts`):
  - 48 різних id; перші 16 — у старому порядку (літеральний список);
  - кожен id має групу з `ACHIEVEMENT_GROUPS`; кількість у групах: start 13, accuracy 9, speed 4, formats 13, powers 4, company 2, host 3, anti 0;
  - цілі: літеральна мапа 15 лічильних з «Рішень»; `all_rounds` = `ROUND_TYPES.length` (7), `all_types` = `QUESTION_TYPES.length` (17); решта 33 — `null`;
  - `PROFILE_BADGES === 8`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/achievements.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Фікстури `Achievement` у тестах отримують `earnedAt: null` (див. «Порядок збирання»). Сервер (`achievementsOf`) поки повертає `earnedAt: null` для кожної — справжні дати дасть задача 6. Веб поки не змінювати, крім фікстур, на які вкаже typecheck, і однієї тимчасової правки: `ICONS` в `AchievementList.tsx` стає `Partial<Record<AchievementId, string>>` зі значком `?? '🏅'` (задача 2 замінює його на `achievement-meta.ts`).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages apps/server/src apps/web/src
  git commit -m "feat(shared): an achievements catalog of 48 (the old 16 in their order and 32 new ones) with page groups, counter goals taken from the round and question type lists, an earnedAt on every achievement, and the types of the achievements page
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 2. Веб: значки, назви, жарти, умови, групи й порядок значків

**Files:**
- Create: `apps/web/src/achievement-meta.ts`, `apps/web/src/achievements.ts`, `apps/web/src/achievements.test.ts`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/format.ts`, `apps/web/src/profile/AchievementList.tsx` (бере значки з `achievement-meta.ts`)
- Test: `achievements.test.ts`, `format.test.ts`, `i18n.test.ts` (якщо там є перевірка ключів), `profile/profile.test.tsx` (нові назви)

**Interfaces:**
- `achievement-meta.ts`:
  ```ts
  import type { AchievementId } from '@quiz/shared';
  /** Значок кожної ачівки (12i, таблиця специфікації). */
  export const ACHIEVEMENT_ICONS: Record<AchievementId, string> = { first_game: '🎈', /* … за «Рішеннями» */ };
  ```
- `i18n.ts` (тексти — дослівно з таблиці «Рішень»):
  - `achievement_<id>` — назва (48), `achievementJoke_<id>` — жарт (48), `achievementHint_<id>` — умова (48; наявні 16 лишаються);
  - `achievementGroup_start` «Перші кроки», `_accuracy` «Влучність», `_speed` «Швидкість», `_formats` «Формати», `_powers` «Бафи й дебафи», `_company` «Компанія», `_host` «Ведучий і автор», `_anti` «Антиачівки»;
  - `menuAchievements` «Ачівки»;
  - `achievementsCount` «Отримано {earned} з {total}»; `achievementsOf` «Ачівки: {name}»;
  - `achievementEarnedOn` «Отримано {date}»; `achievementEarnedLongAgo` «Отримано давно»;
  - `achievementProgress` «{current} / {goal}»; `achievementLockedLabel` «{name}: ще не отримано»;
  - `achievementsMore` «ще {count} →»; `achievementsAll` «Усі ачівки →»; `achievementsNone` «Ще жодної ачівки»;
  - `achievementsEmptyPublic` «Ще жодної ачівки. Усе попереду!».
- `format.ts`:
  ```ts
  /** Дата без часу словами («29 жовтня 2026»); порожній рядок, якщо значення не є датою. */
  export function formatDay(iso: string): string
  ```
- `achievements.ts`:
  ```ts
  import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_INFO, type Achievement, type AchievementCard, type AchievementGroup } from '@quiz/shared';
  /** Отримані, найновіші першими: earnedAt спадно, null («давно») після датованих, при рівності — за порядком ACHIEVEMENTS. */
  export function recentBadges(achievements: Achievement[]): Achievement[]
  /** Картки за групами в порядку ACHIEVEMENT_GROUPS, у групі — за порядком ACHIEVEMENTS; порожні групи пропущено. */
  export function groupCards(items: AchievementCard[]): { group: AchievementGroup; items: AchievementCard[] }[]
  ```

- [ ] **Step 1: Write the failing tests**
  - `achievements.test.ts`:
    - для кожного id з `ACHIEVEMENTS`: є значок (непорожній), назва, жарт і умова (`t(...)` не повертає ключ);
    - дослівні тексти кількох рядків: `host` — «За пультом» / «Перша гра по той бік пульта. Тепер ти знаєш, як це.»; `fast_answer` — «Швидкі пальці», умова «Правильна відповідь швидше ніж за 2 с»; `veteran` — «250 ігор»;
    - **без роду:** жоден жарт чи назва не містить слів із переліку `['відповів', 'переміг', 'вгадав', 'знайшов', 'лишився', 'поставив', 'купив', 'грав', 'бачив', 'дійшов', 'ніс', 'вийшов', 'спробував', 'влучив', 'підглядав', 'забув', 'його', 'Єдиний']` (регістр не важить, межі слів);
    - **без тем росії й СРСР:** жоден текст ачівок не містить `росі`, `москв`, `ссср`, `радянськ` (регістр не важить);
    - `recentBadges`: три отримані з датами в різному порядку, одна з `null`, одна неотримана → датовані спадно, далі `null`; неотриманої немає; рівні дати — за `ACHIEVEMENTS`;
    - `groupCards`: порядок груп, порожня `anti` відсутня, порядок у групі.
  - `format.test.ts`: `formatDay('2026-10-29T10:00:00.000Z')` містить «жовтня 2026» і не містить «:»; `formatDay('нісенітниця') === ''`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/achievements.test.ts apps/web/src/format.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `AchievementList.tsx` бере `ACHIEVEMENT_ICONS` (тимчасова правка задачі 1 зникає). Наявні тексти в тестах профілю, що змінили назву, — на нові (див. «Порядок збирання»).
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): every achievement gets its emoji, a gender-neutral name, a joke and its condition, the page groups get their titles, dates read without the time, and the newest earned badges come first with «long ago» ones after them
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 3. База й запис: міграція `0017`, дебаф, підказка й відповідач у рядку відповіді

**Files:**
- Create: `apps/server/drizzle/0017_achievements.sql` (+ `apps/server/drizzle/meta/_journal.json`, `0017_snapshot.json`)
- Modify: `apps/server/src/db/schema.ts`, `packages/engine/src/answerer.ts`, `packages/engine/src/debuffs.ts`, `apps/server/src/recorder.ts`, `apps/server/src/testing/history-rows.ts`
- Test: `packages/engine/src/answerer.test.ts`, `packages/engine/src/game.debuffs.test.ts`, `apps/server/src/recorder.test.ts`, `apps/server/src/db/schema.test.ts`

**Interfaces:**
- `schema.ts`:
  ```ts
  // answer (після awayMs):
  /** Дебаф, що діяв на учасника в цьому запитанні (12i); null — без дебафу (і в старих іграх). */
  debuff: text('debuff').$type<DebuffKind>(),
  /** «Хто я?»: на якій підказці дано відповідь (12i); null — інший тип, запасне чи старі ігри. */
  clue: integer('clue'),
  /** Командна гра: рядок людини, що відповідала чи натиснула (12i); без зовнішнього ключа — рядки команд пишуться раніше за рядки людей. null — соло, людина чи старі ігри. */
  answeredBy: uuid('answered_by'),

  // profile (після avatar):
  /** Історію цього користувача вже доповнено ачівками (12i); null — ще ні. */
  achievementsSyncedAt: at('achievements_synced_at'),

  /** Отримана ачівка (12i): дата отримання й гра; earned_at null — отримано до 12i («давно»). */
  export const userAchievement = pgTable(
    'user_achievement',
    {
      userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
      achievementId: text('achievement_id').$type<AchievementId>().notNull(),
      earnedAt: at('earned_at'),
      gameId: uuid('game_id').references(() => game.id, { onDelete: 'set null' }),
    },
    (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
  );
  ```
- Міграцію згенерувати з теки `apps/server`: `pnpm exec drizzle-kit generate --name achievements`. Перший рядок — коментар, як у `0016_appeal.sql`: `-- Ачівки I (план 12i): дата й гра отриманої ачівки, позначка доповненої історії, дебаф, підказка й відповідач у рядку відповіді.` Решта — те, що згенерував drizzle-kit.
- `packages/engine/src/debuffs.ts`:
  ```ts
  /** Дебаф, що спрацював на гравця рушія в запитанні index (12i, для запису); інакше null. Після відкриття наступного запитання вже null. */
  export function debuffOn(state: GameState, index: number, playerId: string): DebuffKind | null
  ```
- `packages/engine/src/answerer.ts`:
  ```ts
  /**
   * Людина команди teamId, що відповідала на запитання index (12i, для запису): бліц — хто натиснув (play.buzzers);
   * поточне запитання — answererOf; давніше — null (рекордер уже записав його раніше).
   */
  export function answeredByOf(state: GameState, index: number, teamId: string): string | null
  ```
- `recorder.ts`:
  - `AnswerRow` + `debuff: DebuffKind | null; clue: number | null; answeredBy: string | null`;
  - `answerRowsOf(state, index, playerId, team: boolean)`: звичайний рядок — `debuff: debuffOn(...)`, `clue: !record.spare ? cluesAnswered(play, play.question, record.timeMs, playerId) : null`, `answeredBy: team ? answeredByOf(state, index, playerId) : null`; спроби бліцу — `debuff`, `clue: null`, `answeredBy: team ? play.buzzers?.[playerId] ?? null : null`; рядок штрафу й `AWAY_ATTEMPT` — `debuff`, `clue: null`, `answeredBy: null`;
  - `team` = рядок команди (`teamGame && engineParticipant`); рядки людей (голоси) — усі три null;
  - запис: нові поля — у `values`, а в `onConflictDoUpdate.set` — `debuff: sql\`coalesce(excluded.debuff, ${answer.debuff})\``, так само `answeredBy`; `clue` — просто `excluded.clue` (стан його не губить).
- `testing/history-rows.ts`, `seedGame`:
  - `spec.plays?: PlayRef[]`, `spec.finishedAt?: Date | null` (типово `startedAt` для `finished`), `spec.quizId?: string`;
  - рядок: `payload?: Answer | null`, `timeMs?: number`, `debuff?: DebuffKind`, `clue?: number`, `answeredBy?: number` (індекс гравця в `players`, перетворюється на його id);
  - гравець: `isTeam?: boolean`, `teamOf?: number` (індекс рядка команди); рядки людей вставляються після команд.

- [ ] **Step 1: Write the failing tests**
  - `game.debuffs.test.ts`: `debuffOn` — дебаф спрацював на запитанні 0 → `debuffOn(state, 0, p) === 'fog'`, на 1 → `null`; після відкриття наступного запитання (дебаф згорів) → `null`; той, що чекає (`firedAt: null`), → `null`.
  - `answerer.test.ts`: `answeredByOf` — режим `chosen`, вибрано Петра → на поточному запитанні Петро; бліц з `buzzers[team] = Іра` → Іра і після переходу далі; давнє звичайне запитання → `null`; режим `captain` → капітан.
  - `recorder.test.ts` (за зразком наявних тестів рядків `answer`):
    - соло: Оля відповідає під «Туманом» (ведучий наслав перед запитанням) → рядок `debuff: 'fog'`; після наступного запитання рядок той самий (не затерто); Петро без дебафу → `null`;
    - «Хто я?» з таймером підказок: відповідь на третій підказці → `clue: 3`; власний темп 12c (`cluePace: 'self'`, відкрито 2) → `clue: 2`; інший тип → `null`;
    - командна гра `chosen` (як `manager.answerer.test.ts`): капітан вибрав Петра, Петро відповідає → рядок команди `answered_by` = id Петра; після наступного запитання — те саме; бліц — `answered_by` = хто натиснув; рядки людей — `null`;
    - сума рядків кожного учасника в `answer` + `score_adjustment` = його рахунок (нові стовпці її не змінюють).
  - `schema.test.ts`: міграція `0017` лягає на базу до неї (`createTestDbUpTo('0016_appeal')` → `migrateRest`), старі рядки `answer` мають три `null`, `profile.achievements_synced_at` — `null`, `user_achievement` порожня.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/answerer.test.ts packages/engine/src/game.debuffs.test.ts` і `pnpm vitest run --maxWorkers=1 apps/server/src/recorder.test.ts apps/server/src/db/schema.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Стан гри не змінювати (`GAME_STATE_VERSION` 21). Якщо `cluesAnswered` чи `answererOf` не експортовано з `@quiz/engine`, додати експорт.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/engine/src apps/server
  git commit -m "feat(server): migration 0017 adds the user_achievement table, the synced mark on the profile and three answer columns the recorder now fills from the live state — the debuff the player answered under, the clue a «Хто я?» answer came on, and the person who answered or buzzed for a team — without the rewrite of the last question ever wiping them, and the stored rows still sum to the score
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 4. Сервер: завантажувач гри й умови часу та влучності

**Files:**
- Create: `apps/server/src/achievement-games.ts`, `achievement-games.test.ts`, `game-achievements.ts`, `game-achievements.test.ts`
- Modify: `apps/server/src/history.ts` (лише `export` для `snapshotOf` і `playedQuestions`)
- Test: `achievement-games.test.ts`, `game-achievements.test.ts`

**Interfaces:**
- `achievement-games.ts`:
  ```ts
  /** Зігране (закрите) запитання для ачівок. */
  export interface AchievementQuestion {
    /** Індекс у game.plays і answer.question_index. */
    index: number;
    roundIndex: number;
    roundType: RoundType | null;
    /** Основне запитання (не запасне). */
    question: Question;
    /** Межа часу відповіді, мс (factLimitMs); null — час не справжній. */
    limitMs: number | null;
    /** З балами (не опитування й не хмара). */
    scored: boolean;
    /** Бліц-раунд чи бліц-клітинка. */
    blitz: boolean;
    /** Клітинка поля: хто вибрав, позначка (1, 2, 3), бліц-клітинка. */
    cell: { chooserId: string; mark: 1 | 2 | 3; blitz: boolean } | null;
    ref: PlayRef;
  }

  /** Рядок answer для ачівок (без VOTE_ATTEMPT і AWAY_ATTEMPT). */
  export interface AchievementRow {
    participantId: string;
    questionIndex: number;
    roundIndex: number;
    attempt: number;
    payload: Answer | null;
    timeMs: number;
    accepted: boolean;
    points: number;
    buff: BuffKind | null;
    spareId: string | null;
    debuff: DebuffKind | null;
    clue: number | null;
    answeredBy: string | null;
  }

  /** Учасник таблиці (соло — гравець, командна гра — команда) і люди команди. */
  export interface AchievementPlayer {
    participantId: string;
    userId: string | null;
    members: { participantId: string; userId: string | null }[];
    rank: number | null;
    score: number;
  }

  export interface AchievementGame {
    gameId: string;
    status: GameStatus;
    startedAt: Date;
    finishedAt: Date | null;
    questionsPlayed: number;
    teams: boolean;
    players: AchievementPlayer[];
    /** Порожньо, якщо знімок не читається чи гра стара (без plays). */
    questions: AchievementQuestion[];
    rows: AchievementRow[];
    adjustments: { participantId: string; source: AdjustmentSource; points: number }[];
  }

  /** Ігри за id для ачівок: п'ять запитів на всю пачку (ігри, учасники, відповіді, коригування) і розбір знімка в Node. Порядок — як у gameIds. */
  export async function loadAchievementGames(db: Db, gameIds: string[]): Promise<AchievementGame[]>

  /** Учасник гри, за якого грав користувач: соло — свій рядок; команда — рядок команди і personId — рядок людини; null — не грав. */
  export function whoIn(game: AchievementGame, userId: string): AchievementWho | null
  ```
  - Запитання — `playedQuestions(quiz, plays, questionsPlayed)` з `history.ts`; `limitMs` — `factLimitMs(question, round, voice)` (як `factInputOf`: `voice` — усна клітинка через `cellAnswerMode`); `cell.mark` — з `findCell(round, cellId).cell.mark` (`'x2'` → 2, `'x3'` → 3, інакше 1).
- `game-achievements.ts`:
  ```ts
  /** Пороги ігрових ачівок (12i). */
  export const ACHIEVEMENT_LIMITS = {
    fastMs: 2000, fastTenMs: 3000, fastTen: 10, lastSecondMs: 1000,
    sniperShare: 0.9, sniperQuestions: 10, bluffFooled: 3, bluffsAll: 3,
    boardCells: 5, buffs: 4, debuffed: 3, marathon: 50, nightEnd: 5, morning: [5, 8],
  } as const;

  /** За кого рахуємо: participantId — учасник таблиці; personId — рядок людини в командній грі (null — соло). */
  export interface AchievementWho { participantId: string; personId: string | null }

  /** Ачівки однієї завершеної гри (26 ігрових, «Рішення плану»); незавершена гра — []. Порядок — як у ACHIEVEMENTS. */
  export function gameAchievements(game: AchievementGame, who: AchievementWho): AchievementId[]

  /** Година за київським часом (0–23). */
  export function kyivHour(date: Date): number
  ```
  - Ця задача робить умови: `fast_answer`, `fast_10`, `last_second`, `sniper`, `eagle_eye`, `jeweler`, `clairvoyant`, `survey_top`, `lone_genius`, `team_win`, `night_owl`, `early_bird`, `marathon`. Решта — задача 5 (до того їх просто немає в результаті).
  - Внутрішні помічники: `ownRows(game, who)` (обсяг `answer`), `answerRow(row)` (`attempt ≥ 0`), `silentRisk(row)` (`attempt === PENALTY_ATTEMPT && buff === 'risk'`).

- [ ] **Step 1: Write the failing tests**
  - `game-achievements.test.ts` — штучні `AchievementGame` через помічник `fakeGame({ questions, rows, players, … })` з типовими значеннями (класичний раунд, `limitMs: 30000`, завершена гра). Для кожної умови «так» і «ні»:
    - `fast_answer`: 1999 мс → так; 2000 → ні; неприйнята → ні; `limitMs: null` (усна клітинка) → ні; `timeMs: 0` → ні;
    - `fast_10`: 10 запитань по 2999 мс → так; 9 → ні; дві спроби бліцу на одному запитанні рахуються раз;
    - `last_second`: `limitMs 30000`, 29000 → так; 28999 → ні; 30001 → ні;
    - `sniper`: соло, 10 класичних, 9 прийнятих → так; 10 класичних, 8 прийнятих → ні; 9 запитань → ні; соло мовчить на 2 з 10 класичних (рядків немає) → знаменник 10, 8 прийнятих → ні; мовчання з «Ризиком» рахується промахом; людина команди: 10 рядків команди з `answeredBy` = вона, 9 прийнятих → так, а її товаришка без рядків → ні;
    - `eagle_eye`: точка в межах допуску (`accuracy 1`) → так; прийнята «пів ціни» → ні; відповідь на запасне → ні;
    - `jeweler`: повзунок рівно `correct` → так; у допуску, але не рівно → ні; число так само;
    - `clairvoyant`: `clue: 1` → так; `clue: 2` → ні; старий рядок без `clue`, таймер, `timeMs` < інтервалу → так; старий рядок власного темпу без `clue` → ні;
    - `survey_top`: влучив у рядок з найбільшою `popularity` → так; лише в другий → ні; дошка з хмари (`ref.surveyRows`) — бере її;
    - `lone_genius`: 4 відповіли, правильна лише своя → так; 3 відповіли → ні; дві правильні → ні; клітинка поля → ні;
    - `team_win`: командна гра, команда перша, бали > 0, команд ≥ 2 → так кожній людині (`personId` будь-хто з команди); соло-перемога → ні;
    - `night_owl`: фініш 2026-10-29T01:30:00Z (3:30 за Києвом, EET+2 після переходу) → так; 03:30Z (5:30) → ні; `finishedAt: null` → ні;
    - `early_bird`: старт 2026-07-01T03:30:00Z (6:30 літнього часу EEST+3) → так; 05:30Z (8:30) → ні;
    - `marathon`: `questionsPlayed 50` → так; 49 → ні;
    - незавершена гра (`aborted`) з усіма умовами → `[]`;
    - командна гра без `answeredBy` (стара): ачівки за відповіді нікому, `team_win` — кожному.
  - `achievement-games.test.ts` (PGlite, `seedGame` із задачі 3): гра з класичним раундом (`single`, `pin`) і полем (клітинка ×2) з `plays`, рядками з `payload`, `timeMs`, `debuff`, `clue`, коригуванням `duel` і рядками `VOTE_ATTEMPT` / `AWAY_ATTEMPT` → `loadAchievementGames` дає запитання з `limitMs`, `cell.mark 2`, рядки без голосів і позначок виходу, коригування; командна гра — `players[0].members` з рядками людей; стара гра без `plays` → `questions: []`; зіпсований знімок → `questions: []` без винятку; `whoIn` для соло, людини команди й чужого → як очікується.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/game-achievements.test.ts apps/server/src/achievement-games.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Логіку «хто відповідав» не дублювати: усе через `ownRows`. Межі (`<` / `≤`) — дослівно з «Рішень».
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): a loader reads everything one game's achievements need in a few queries per batch, and a pure check gives fast fingers, ten under three seconds, the last second, sniper accuracy over your own questions, the eagle eye, exact sliders and numbers, the first clue, the top survey answer, the lone right answer, the team win, night and morning games and the marathon — answers count only for the team member who gave them
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 5. Сервер: умови форматів, бафів і дебафів

**Files:**
- Create: `apps/server/src/game-achievements.formats.test.ts`
- Modify: `apps/server/src/game-achievements.ts`
- Test: `game-achievements.formats.test.ts`, `achievement-games.test.ts` (один наскрізний випадок з бази)

**Interfaces:**
- `gameAchievements` додає: `wall_clean`, `sort_clean`, `chain_full`, `bluff_master`, `lie_detector`, `ladder_top`, `wipeout_bank`, `last_hero`, `duelist`, `board_owner`, `buff_gourmet`, `double_jackpot`, `unbreakable` — точно за «Рішеннями». Обсяг: `ladder_top`, `wipeout_bank`, `last_hero`, `duelist` — `outcome`; решта — `answer`.
- Помічник «Ва-банк» — спільний з `history.ts` не робити (там він рахує інше); кроки будуються так само: для раунду «Ва-банк» із `ref.wipeout.end` — запитання раунду за порядком, `price = question.points`, `correct` — `[participantId]`, якщо є прийнятий рядок `attempt 0`, `took = ref.wipeout?.took ?? []`.

- [ ] **Step 1: Write the failing tests** (`game-achievements.formats.test.ts`, той самий `fakeGame`):
  - `wall_clean`: `{ type: 'wall', found: 4, groups: 4, mistakes: 0 }` → так; `mistakes: 1` → ні; `found: 3` → ні;
  - `sort_clean`: `misses: 0, sorted === total` → так; `misses: 1` → ні;
  - `chain_full`: 4 слова, `solved: 3, hints: 0` → так; `hints: 1` → ні; `solved: 2` → ні;
  - `bluff_master`: `fooled: 3` → так; `fooled: 2` → ні;
  - `lie_detector`: три блефи, на всіх `truth: true` → так; на одному вигадка → ні; два блефи → ні; на одному блефі рядка немає → ні;
  - `ladder_top`: `ladder.contestant` = учасник, `outcome.kind 'top'` → так; `'took'` → ні; інший учасник → ні;
  - `wipeout_bank`: три кроки, усі правильні, `end` на останньому → так; згорів на другому → ні; забрав (`took`) на другому → ні; банк 0 → ні; раунд без `end` (гру обірвано) → ні;
  - `last_hero`: Петро вибув у випробуванні, Оля дожила до `end` → так Олі, ні Петрові; ніхто не вибув → ні;
  - `duelist`: `duel +200` → так; `duel −200` → ні;
  - `board_owner`: 5 своїх клітинок прийнято → так; 4 → ні; клітинка, вибрана іншим, → не рахується; бліц-клітинка → не рахується; відповідь на запасне своєї клітинки → рахується;
  - `buff_gourmet`: 4 різні бафи (`double`, `shield`, `risk` мовчанням, `scope`) → так; 3 → ні; той самий баф двічі рахується раз;
  - `double_jackpot`: `double` прийнято на клітинці ×3 → так; ×1 → ні; неприйнято → ні;
  - `unbreakable`: 3 прийняті під `fog`, `mud`, `flip` → так; 2 → ні; неприйнята під дебафом → не рахується;
  - командна гра: `board_owner` і `unbreakable` — лише людині з `answeredBy`; `ladder_top` і `wipeout_bank` — кожній людині команди.
  - `achievement-games.test.ts`: гра зі стіною й дуеллю з бази через `loadAchievementGames` → `gameAchievements` містить `wall_clean` і `duelist`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/game-achievements.formats.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Якщо поле підсумку формату (`solved`, `found`, `misses`) у рушії означає інше, ніж у «Рішеннях», виконавець звіряє з `scoreChain` / `scoreWall` / `scoreSort`, пише формулу у звіті й не підганяє тест.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): one game also gives a clean wall, a clean sort, a full chain with no hints, a bluff three players fell for, the truth in every bluff, the top of the ladder, a carried wipeout bank, the last one standing, a won duel, five own board cells, four buffs, double points on a ×2 or ×3 cell and three right answers under a debuff — ladder, wipeout, survival and duels go to the whole team
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 6. Сервер: лічильники, сховище, фініш гри й API

**Files:**
- Create: `apps/server/src/achievement-store.ts`, `apps/server/src/achievement-store.test.ts`
- Modify: `apps/server/src/achievements.ts`, `history.ts` (`answeredTypes`), `profiles.ts`, `profile-routes.ts`, `recorder.ts`
- Test: `achievement-store.test.ts`, `achievements.test.ts`, `profiles.test.ts`, `profile-routes.test.ts`, `recorder.test.ts`, `history.test.ts` (для `answeredTypes`)

**Interfaces:**
- `achievements.ts`:
  ```ts
  /** Кар'єрні факти (16 наявних полів AchievementFacts + 12i). */
  export interface CareerFacts {
    games: number; wins: number; hosted: number; bestStreak: number; perfectGames: number; winStreak: number;
    blitzWins: number; finalHits: number; comebacks: number; friendsPlayedWith: number;
    /** Разів у трійці (podiumStats). */
    podium: number;
    /** Куплених дебафів у соло-іграх. */
    debuffsBought: number;
    /** Завершених ігор за вікторинами користувача. */
    authorGames: number;
    /** Різних типів раундів, де є свій рядок. */
    roundTypes: number;
    /** Різних типів запитань, де є своя відповідь. */
    questionTypes: number;
  }
  /** 22 кар'єрні ачівки, отримані за фактами, у порядку ACHIEVEMENTS. */
  export function careerEarned(facts: CareerFacts): AchievementId[]
  /** Поступ лічильних: min(значення, goal) з ACHIEVEMENT_INFO. */
  export function careerProgress(facts: CareerFacts): Partial<Record<AchievementId, number>>
  ```
  `achievementsOf` прибрати (його заміняє сховище); `EARNED` + `veteran`, `podium_10`, `prankster`, `author_hit`, `all_rounds`, `all_types`.
- `history.ts`:
  ```ts
  /** Різні типи основних запитань (без запасних), на які є відповідь користувача: свої рядки, голоси людини, рядки команди з answered_by = рядок людини; без AWAY_ATTEMPT. Тип — у SQL із game.plays і знімка. */
  export async function answeredTypes(db: Db, userId: string): Promise<Set<QuestionType>>
  ```
  SQL (орієнтир; виконавець перевіряє на PGlite): `jsonb_array_elements(g.plays) with ordinality p(ref, n)` для `n ≤ g.questions_played`, раунд `g.quiz_snapshot->'rounds'->((p.ref->>'roundIndex')::int)`, тип — перше з `questions[*]` чи `categories[*].cells[*].question` з `id = p.ref->>'questionId'`; з'єднання з `answer` за `question_index = n − 1`.
- `achievement-store.ts`:
  ```ts
  /** Кар'єрні факти користувача (те, що profileFacts рахував для ачівок, + 12i). */
  export async function careerFacts(db: Db, userId: string, prepared?: { games: Awaited<ReturnType<typeof playerGames>>; tables: GameTable[]; stats: ProfileStats }): Promise<CareerFacts>

  /**
   * Дописує пропущені ачівки й повертає всі отримані (лише відомі id).
   * Історію доповнює раз (earned_at null). at — гра, що щойно закінчилась: її ігрові й нові кар'єрні — з її датою й id;
   * без at — нові кар'єрні з now().
   */
  export async function syncAchievements(
    db: Db,
    userId: string,
    facts: CareerFacts,
    at: { gameId: string; earnedAt: Date } | null,
  ): Promise<{ earned: Map<AchievementId, { earnedAt: Date | null; gameId: string | null }>; fresh: AchievementId[] }>

  /** Після фінішу гри: учасники з акаунтами, ведучий і власник вікторини. Повертає щойно отримані (для 12j). Незавершена гра — порожньо. */
  export async function awardGame(db: Db, gameId: string): Promise<Map<string, AchievementId[]>>

  /** Сторінка ачівок: own — усі 48 з поступом; інакше лише отримані без поступу. null — немає такого користувача. */
  export async function achievementsPage(db: Db, userId: string, own: boolean): Promise<AchievementsPage | null>
  ```
  - Доповнення: `participant.user_id = userId` і `game.status = 'finished'` (крім `at.gameId`), за `startedAt` зростанням, пачками по 20 через `loadAchievementGames` → `whoIn` → `gameAchievements` → `insert … onConflictDoNothing` з `earnedAt: null, gameId`; потім кар'єрні з `null`; потім `profile.achievementsSyncedAt = now()` (через `ensureProfile`).
  - `fresh` — id, які саме цей виклик вставив (`returning()`).
- `profiles.ts`, `profileFacts`: рахує `stats` як зараз, `careerFacts(db, userId, prepared)` без повторних запитів, `syncAchievements(…, null)`, і повертає `achievements: Achievement[]` — усі 48 (`earned`, `earnedAt` ISO чи `null`).
- `profile-routes.ts`:
  - `GET /api/me/achievements` — 401 без входу, інакше `achievementsPage(db, user.id, true)`;
  - `GET /api/profiles/:id/achievements` — `rateLimit { max: 120, timeWindow: '1 minute' }`, `id.length > MAX_ID_LENGTH` чи невідомий → 404, інакше `achievementsPage(db, id, false)`.
- `recorder.ts`: у `job` після `save`: `if (state.phase === 'finished' && !awarded.has(room.id)) { await awardGame(db, room.id); awarded.add(room.id); }`; `awarded` забувається разом з кімнатою (`forget`).

- [ ] **Step 1: Write the failing tests**
  - `achievements.test.ts`: `careerEarned` — нові 6 (veteran 250, podium_10 10, prankster 10, author_hit 10, all_rounds 7, all_types 17) на межі й на 1 менше; 16 наявних — як і були (перенести наявні очікування з `achievementsOf`); `careerProgress` — `games 37` → `games_10: 10, games_50: 37, games_100: 37, veteran: 37`; разові без ключа.
  - `history.test.ts`: `answeredTypes` — гра з `single`, `text`, клітинкою поля `pin`, опитуванням (голос людини) і запасним (не рахується) → `{'single', 'text', 'pin', 'poll'}`; командна гра: рядок команди з `answered_by` = Петро → тип у Петра, не в Олі; стара гра без `plays` → нічого.
  - `achievement-store.test.ts` (PGlite, `seedGame`):
    - **доповнення:** користувач із двома старими завершеними іграми (у другій правильна за 1500 мс) і без рядків у `user_achievement` → перше читання (`syncAchievements(…, null)`) пише `first_game`, `first_win`, `fast_answer` з `earned_at null`, `fast_answer.game_id` = друга гра; `achievements_synced_at` заповнено; друге читання нічого не вставляє (`fresh: []`) і завантажувача не кличе (шпигун на `loadAchievementGames` через `vi.mock` чи лічильник запитів);
    - **фініш:** `awardGame(gameId)` нової гри → `fast_answer` у гравця з `earned_at = finishedAt` і `game_id`; повторний `awardGame` → порожньо й без нових рядків; гравець без акаунта → нічого; ведучий отримує `host` (не автопілот) і не отримує за автопілот; власник вікторини, що не грав, отримує `author_hit` на десятій завершеній грі;
    - **фініш до першого читання:** у користувача стара гра з `fast_answer` і нова з `jeweler` → `fast_answer` з `null`, `jeweler` з датою нової;
    - **читання:** `friends_5` після п'ятої підписки → `earned_at` ≈ `now()`, `game_id null`;
    - **назавжди:** відписка від друга не прибирає `friends_5`;
    - **невідомий id** у таблиці (вставити `'gone'`) → читання його пропускає;
    - **сторінка:** `achievementsPage(own)` — 48 карток, `earned` = кількість, поступ `games_10` «2 / 10», у отриманих `progress: null`; `achievementsPage(public)` — лише отримані, у всіх `progress: null`, `own: false`; невідомий користувач → `null`;
    - **команди:** командна гра, Петро відповідав (`answered_by`) і отримав `fast_answer`, Оля — ні; обоє отримали `team_win`.
  - `profiles.test.ts`: `profileFacts` повертає 48 ачівок з `earnedAt`; наявні перевірки `earned` — без змін.
  - `profile-routes.test.ts`: `GET /api/me/achievements` без входу → 401; з входом → 48 карток; `GET /api/profiles/:id/achievements` чужого → лише отримані без поступу; невідомий id → 404; задовгий id → 404.
  - `recorder.test.ts`: гра доходить до `finished` → після `recorder.idle()` у гравця з акаунтом є `user_achievement` з `game_id` цієї гри; збій `awardGame` (шпигун кидає раз) → повтор запису дописує ачівки.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/achievement-store.test.ts apps/server/src/achievements.test.ts apps/server/src/profiles.test.ts apps/server/src/profile-routes.test.ts apps/server/src/recorder.test.ts apps/server/src/history.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `profileFacts` не має робити жодного запиту більше, ніж «Глобальні обмеження» дозволяють після доповнення (наявні + `select user_achievement` + три `count`: дебафи, ігри авторів і типи запитань). Перевірити, що наявні e2e-перевірки API профілю (`achievements.find(...).earned`, ключі публічного профілю) і далі правдиві.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/src
  git commit -m "feat(server): achievements are stored with their date and game — the first read fills a user's history once as «long ago», a finished game awards its players, its host and the quiz author with the finish time, later career ones get the read time and nothing is ever taken back — six new career counters with progress, the own page with all 48 and the public one with earned only
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 7. Веб: сторінка ачівок, чужа сторінка й пункт меню

**Files:**
- Create: `apps/web/src/pages/Achievements.tsx`, `apps/web/src/pages/Achievements.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx`, `apps/web/src/menu/Menu.tsx`, `apps/web/src/api.ts`, `apps/web/src/i18n.ts` (якщо бракує), `apps/web/src/styles.css`
- Test: `Achievements.test.tsx`, `AppRoutes.test.tsx`, `menu/Menu.test.tsx`

**Interfaces:**
- `api.ts`:
  ```ts
  export const getMyAchievements = () => fetchData<AchievementsPage>('/api/me/achievements');
  export const getAchievements = (id: string) => fetchData<AchievementsPage>(`/api/profiles/${encodeURIComponent(id)}/achievements`);
  ```
- `AppRoutes.tsx` (усередині `WithMenu`): `<Route path="/achievements" element={<Achievements />} />`, `<Route path="/profile/:id/achievements" element={<Achievements />} />`.
- `Achievements.tsx`:
  ```tsx
  /** Свої ачівки (/achievements, лише після входу) чи чужі (/profile/:id/achievements, лише отримані). */
  export function Achievements()
  ```
  - без `id`: `getMyAchievements()`; 401 → `Navigate` на `/login?next=%2Fachievements` (як інші сторінки для тих, хто увійшов; виконавець бере наявний спосіб, напр. з `Profile.tsx`);
  - з `id`: `getAchievements(id)`; 404 → «Такого профілю немає.» (`profileNotFound`);
  - розмітка:
    ```html
    <main class="app wide achievements-page">
      <h1 class="brand">Ачівки</h1>            <!-- чужа: «Ачівки: Оля» з посиланням на /profile/:id -->
      <p class="achievements-count">Отримано 3 з 48</p>
      <section class="achievement-group" aria-labelledby="g-start">
        <h2 id="g-start">Перші кроки</h2>
        <ul class="achievement-cards">
          <li class="achievement-card">                        <!-- неотримана: .is-locked, aria-label «10 ігор: ще не отримано» -->
            <span class="achievement-icon" aria-hidden="true">🎈</span>
            <h3>Перша гра</h3>
            <p class="achievement-joke">Ласкаво просимо! Назад дороги немає.</p>
            <p class="achievement-hint">Зіграти першу гру з акаунта</p>
            <p class="achievement-date">Отримано 29 жовтня 2026</p>   <!-- або «Отримано давно» -->
            <!-- неотримана лічильна: <progress max="10" value="1"> і <p class="achievement-progress">1 / 10</p> -->
          </li>
        </ul>
      </section>
    </main>
    ```
  - групи — `groupCards(page.items)`; на чужій без отриманих — `achievementsEmptyPublic`.
- `Menu.tsx`: `ACHIEVEMENTS_ITEM` між `HISTORY` і `PROFILE` (див. «Рішення»).
- `styles.css`: `.achievement-cards` — `display: grid; gap: .75rem; grid-template-columns: 1fr`, від `min-width: 560px` — `repeat(auto-fill, minmax(16rem, 1fr))`; `.achievement-card` — рамка й панель як `.invite-list`; `.achievement-icon` 2rem; `.achievement-hint`, `.achievement-date`, `.achievement-progress` — дрібним (0.8rem, `var(--muted)` чи наявний токен); `.achievement-card.is-locked` — `filter: grayscale(1); opacity: .6`; `progress` на всю ширину картки; довгі слова переносяться (`overflow-wrap: anywhere`).

- [ ] **Step 1: Write the failing tests**
  - `Achievements.test.tsx` (мок `api`, за зразком `Profile.test.tsx`):
    - свій вигляд: «Отримано 2 з 48», заголовки груп у порядку, без «Антиачівки»; картка «Швидкі пальці» з жартом, умовою й «Отримано 29 жовтня 2026»; картка з `earnedAt: null` — «Отримано давно»; «10 ігор» — `.is-locked`, `aria-label` «10 ігор: ще не отримано», `progress` з `value 1` і текст «1 / 10»; разова неотримана — без `progress`;
    - чужий вигляд (`/profile/u2/achievements`): «Ачівки: Оля» з посиланням на профіль; лише отримані картки, жодного `progress`; без отриманих — «Ще жодної ачівки. Усе попереду!»;
    - 401 на своїй → перехід на вхід; 404 на чужій → «Такого профілю немає.»
  - `AppRoutes.test.tsx`: обидва шляхи малюють сторінку ачівок у меню.
  - `Menu.test.tsx`: для того, хто увійшов, — п'ять пунктів у порядку «Приєднатися», «Мої вікторини», «Історія», «Ачівки», «Профіль»; «Ачівки» активні на `/achievements`; анонім пункту не бачить.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/pages/Achievements.test.tsx apps/web/src/AppRoutes.test.tsx apps/web/src/menu/Menu.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Тексти — лише з `i18n.ts`. Анімацій немає.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «🏅 Ачівки» sits between the history and the profile in the menu and opens a page with «Отримано N з 48», the groups, cards with an emoji, a joke, the condition in small print and the date or «давно», grey locked cards with «37 / 50», and another player's page with earned ones only
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 8. Веб: рядок значків у профілі

**Files:**
- Create: `apps/web/src/profile/AchievementStrip.tsx` (замість `AchievementList.tsx`, старий файл видалити)
- Modify: `apps/web/src/pages/Profile.tsx`, `apps/web/src/pages/PublicProfile.tsx`, `apps/web/src/i18n.ts` (якщо бракує), `apps/web/src/styles.css`
- Test: `apps/web/src/profile/profile.test.tsx`, `apps/web/src/pages/Profile.test.tsx`, `apps/web/src/pages/PublicProfile.test.tsx`

**Interfaces:**
- ```tsx
  /** Останні PROFILE_BADGES отриманих значків і посилання на сторінку ачівок (to). */
  export function AchievementStrip({ achievements, to }: { achievements: Achievement[]; to: string })
  ```
  - розмітка: `<ul class="achievements achievement-strip">` з `<li title="Швидкі пальці"><span aria-hidden="true">🏎️</span><span class="sr-only">Швидкі пальці</span></li>`; після списку — `<Link to={to}>` «ще 7 →» (якщо отриманих > 8) чи «Усі ачівки →»; без отриманих — `<p class="meta">Ще жодної ачівки</p>` і «Усі ачівки →»;
  - порядок — `recentBadges` (задача 2), перші `PROFILE_BADGES`.
- `Profile.tsx`: секція «Ачівки» — `<AchievementStrip achievements={profile.achievements} to="/achievements" />`.
- `PublicProfile.tsx`: `<AchievementStrip achievements={profile.achievements} to={`/profile/${profile.id}/achievements`} />`.
- `styles.css`: `.achievement-strip` — `display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0`; значок 1.75rem у колі 2.5rem; старі `.achievements li` / `.locked` правила прибрати чи звузити, щоб не ламали рядок.

- [ ] **Step 1: Write the failing tests**
  - `profile.test.tsx`: 10 отриманих з різними датами і 2 з `null` → 8 значків, найновіший перший, «ще 4 →» веде на `to`; 3 отримані → 3 значки й «Усі ачівки →»; жодної → «Ще жодної ачівки» й «Усі ачівки →»; неотриманих у рядку немає; назва є в тексті (`sr-only`) і в `title`.
  - `Profile.test.tsx`: посилання рядка — `/achievements`.
  - `PublicProfile.test.tsx`: посилання — `/profile/u2/achievements`; наявні перевірки, що шукали `🔒` чи 16 рядків, — на рядок значків (див. «Порядок збирання»).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/profile apps/web/src/pages/Profile.test.tsx apps/web/src/pages/PublicProfile.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): the own and the public profile show a row of the eight newest earned badges with «ще N →» to the achievements page instead of a list of all names with locks
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```

### Задача 9. Наскрізний сценарій 12i з кадрами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `click`, `afterSplash`, `pickOption`, `shot`, `snapshot`, `expectNoSideScroll`, `POLL`, `exact`, `problems`, `MENU`, `classicRound`, `makeRoundsQuiz` (чи той спосіб складати вікторину, що й у 12g / 12h).
- Вміст без тем росії й СРСР:
  ```ts
  function achievementQuestions12i() {
    const common = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
    const options = (...texts: string[]) => texts.map((text, i) => ({ id: 'abcd'[i], text }));
    return [
      { ...common, id: 'i1', type: 'single' as const, text: 'Яка річка тече через Київ?', options: options('Дніпро', 'Дністер', 'Десна', 'Південний Буг'), correctId: 'a' },
      { ...common, id: 'i2', type: 'single' as const, text: 'Яке місто — столиця Буковини?', options: options('Чернівці', 'Ужгород', 'Луцьк', 'Рівне'), correctId: 'a' },
    ];
  }
  ```
  - Гра «Ачівки 12i»: один класичний раунд «Розминка» без перемішування варіантів, `speedBonus: false`, без бафів і дебафів.
- Пульт — 1280 × 800 (`host12i`); телефони 375 × 812: Оля (`olya12i`, з акаунтом), Петро (`petro12i`, без акаунта).
- Локатори: `card(page, name) = page.locator('.achievement-card', { has: page.getByRole('heading', { name, exact: true }) })`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12h:
  ```ts
  it('part 12i: achievements I — after Оля answers «Дніпро» in under two seconds on a 375 phone, «🏅 Ачівки» between «Історія» and «Профіль» opens «Отримано N з 48» with «Швидкі пальці» dated today, grey «10 ігор» at «1 / 10», no «Антиачівки» group, cards in several columns at 1280, the profile shows a row of the newest badges, the host sees only Оля's earned cards with no progress on her public page and «За пультом» on own page, and an anonymous visitor gets 401', async () => {
    try {
      await achievements12i();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Підготовка `achievements12i()`:**
  1. `host = open('host12i', 1280, 800)`, `register(host, 'host', 'Ліна Ведуча', 'host12i@example.com')`; вікторина → `POST /api/quizzes`.
  2. `olya = open('olya12i', 375, 812)`, `register(olya, 'menu', 'Оля Квіткова', 'olya12i@example.com')`; `olyaId` — з `/api/me/profile`.
  3. «Грати» → `code`; `join(olya, code, 'Оля', false)`, `petro = open('petro12i', 375, 812)`, `join(petro, code, 'Петро', false)`.

  **Кроки:**
  1. **Гра.** «Почати гру» → `afterSplash(host, olya, petro)` → «Почати раунд» → `afterSplash`. Оля **одразу** тисне «Дніпро» (`pickOption` без пауз), Петро — «Дністер». «Показати відповідь» → «Далі» → i2: Оля «Чернівці», Петро «Ужгород». «Далі» до `finished`.
  2. **Нагорода записана.** `expect.poll(async () => ((await (await olya.request.get(`${base}/api/me/achievements`)).json()) as AchievementsPage).items.find((i) => i.id === 'fast_answer')?.earned, POLL).toBe(true)` — рекордер нагороджує після запису фінішу. Якщо падає через час відповіді понад 2 с, виконавець не послаблює поріг, а з'ясовує, звідки затримка (заставка, `afterSplash`), і пише у звіті.
  3. **Меню.** `olya.goto(base)`: імена посилань `MENU` — `['Приєднатися', 'Мої вікторини', 'Історія', 'Ачівки', 'Профіль']`; `expectNoSideScroll(olya, 'p12i-menu')`; кадр `p12i-menu`. Клік «Ачівки» → `/achievements`.
  4. **Сторінка на телефоні.**
     - `h1` «Ачівки»; `.achievements-count` — «Отримано N з 48», `N ≥ 3`;
     - заголовки `h2` — у порядку «Перші кроки», «Влучність», «Швидкість», «Формати», «Бафи й дебафи», «Компанія», «Ведучий і автор»; «Антиачівки» немає;
     - `card(olya, 'Швидкі пальці')` без `.is-locked`, з «Відповідь є, а запитання ще не дочитане. Сміливо!», «Правильна відповідь швидше ніж за 2 с» і `Отримано ${today}`, де `today = await olya.evaluate(() => new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()))`;
     - `card(olya, 'Перша гра')` і `card(olya, 'Перша перемога')` отримані;
     - `card(olya, '10 ігор')` — `.is-locked`, `progress` з `value="1"`, текст «1 / 10»;
     - `expectNoSideScroll(olya, 'p12i-page-phone')`; кадр `p12i-page-phone`; прокрутити до «Швидкості» → кадр `p12i-page-phone-speed`.
  5. **Сторінка на 1280.** `olya.setViewportSize({ width: 1280, height: 800 })`; дві перші картки «Перших кроків» на одному рядку (`boundingBox().y` рівні, `x` різні); кадр `p12i-page-desktop`; повернути 375 × 812.
  6. **Профіль Олі.** `olya.goto(`${base}/profile`)`: `.achievement-strip li` — від 3 до 8, серед них «Швидкі пальці» (текст `sr-only`); посилання «Усі ачівки →» чи «ще N →» веде на `/achievements`; `expectNoSideScroll(olya, 'p12i-profile-strip')`; кадр `p12i-profile-strip`.
  7. **Чужа сторінка.** `host.goto(`${base}/profile/${olyaId}`)` → рядок значків → клік посилання → `/profile/${olyaId}/achievements`: `h1` містить «Ачівки: Оля Квіткова» (нікнейм з профілю Олі — виконавець бере фактичний); жодного `.is-locked` і жодного `progress`; «10 ігор» немає; «Швидкі пальці» є; кадр `p12i-public-desktop`.
  8. **Своя сторінка ведучого.** `host.goto(`${base}/achievements`)`: `card(host, 'За пультом')` отримана з `Отримано ${today}`; кадр `p12i-host-own`.
  9. **API.** `GET /api/profiles/${olyaId}/achievements` від ведучого: кожен `item.earned === true` і `item.progress === null`, `own === false`, `total === 48`. Анонімний контекст: `GET /api/me/achievements` → 401.
  10. **Старі перевірки профілю** — правки з «Порядку збирання» (частина 6: «10 ігор», «За пультом», рядок замість 16; частина 7e — якщо треба).
  11. `expect(problems).toEqual([])`.
- [ ] **Step 2: Run** на передньому плані (не у фоні): `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 12i"` → PASS. Переглянути кадри `p12i-*`:
  - нижнє меню з п'ятьма кнопками на 375 px читається й не обрізане;
  - картки на 375 — одна колонка, жарт і умова переносяться, дата дрібним шрифтом; сірі картки читаються, поступ видно;
  - на 1280 — кілька колонок, без порожніх дір;
  - рядок значків у профілі не ширший за екран;
  - чужа сторінка — лише отримані.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані** (не у фоні): `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Особливо частини 6 (профіль, друзі, ачівки), 7e (ставка у фіналі), 11h (автопілот і `/api/me/profile`), 12r (продовжена гра). Якщо PGlite чи браузер падають від нестачі пам'яті, прогнати групами за `-t` (теж на передньому плані; останні групи — як у пам'яті проєкту, плюс `^part 12i`) і назвати це в звіті.
- [ ] **Step 4: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 12i end-to-end — a right answer in under two seconds on a 375 phone earns «Швидкі пальці» dated today on the new achievements page reached from «🏅 Ачівки» in a five-button menu, locked cards are grey with «1 / 10», the 1280 page has several columns, the profile shows the newest badges, another player's page lists earned ones only, the host gets «За пультом», and the old profile checks follow the badge row
  
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HuNTWpsn4KnHrDwfFE67jp"
  ```
