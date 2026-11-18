# План 42: імпорт і експорт вікторин (38e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Стан гри не змінюється взагалі. Сервер **не змінюється**: імпорт іде через наявні `POST /api/uploads`, `POST /api/uploads/audio` і `POST /api/quizzes`, експорт — через `GET /api/quizzes/:id` і `GET /uploads/:name`.

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`c455b4c9`, після плану 41):
> - схема: `quizSchema` (`packages/shared/src/quiz.ts` ~1649: `title` 1–120, `description` ≤ 500, `settings`, `rounds` 1–`LIMITS.maxRounds` (10), `duels?`, `spares?`; `superRefine` — ≤ `LIMITS.maxQuizQuestions` (200) запитань, унікальні id); `classicRoundSchema` ~1212 (`id`, `type: 'classic'`, `title` ≤ 60, `description?`, `speedBonus`, `shuffleOptions`, `rules`, `questions` 1–`LIMITS.maxQuestions` (100)); спільне запитання `base` ~356 (`id`, `text` 1–300, `imageUrl: string | null`, `video: Video | null`, `timeLimit` 5–120, `points` 0–2000, `hint?` 1–200, `audio?`, `reveal?`, `betsCut?`); прості типи ~457: `single` (`options` 2–6 з `{ id, text ≤ 120, imageUrl? }`, `correctId`), `boolean` (`correct: boolean`), `text` (`accepted` 1–10 рядків ≤ 200), `numeric` (`correct`, `tolerance ≥ 0`, `noOvershoot?`); `multi` — **не** простий тип таблиці; `upgradeQuiz` (`packages/shared/src/upgrade.ts`, старий формат → класичний раунд), `roundQuestions(round)` (~1956);
> - **окремого поля «пояснення» в запитанні немає**; найближче — `hint` («Підказка ведучого», ≤ `LIMITS.hintText` = 200);
> - медіа в схемі: лише рядки за `IMAGE_URL` = `/^\/uploads\/[a-z0-9]{16,64}\.(jpg|png|webp)$/` (`base.imageUrl`, `option.imageUrl`, картка пам'яті, `jigsaw.photo`, `spotdiff.original/changed`) і `AUDIO_URL` = `…\.(mp3|ogg|m4a)$` (`audio.url` при `source: 'file'`, трек мелодії); YouTube — `video`/`audio.source: 'youtube'`/`clip` за `YOUTUBE_ID` — посилання, не файли;
> - сховище: `apps/server/src/upload-routes.ts` — `POST /api/uploads` (тип із `IMAGE_LIMITS.types`, ≤ `IMAGE_LIMITS.maxBytes` = 2 МБ), `POST /api/uploads/audio` (`AUDIO_LIMITS`, ≤ 5 МБ), тіло — сам файл, тип за вмістом (`sniffImage`/`sniffAudio`), MP3 без тегів, ім'я `randomBytes(16).hex` → `{ url: '/uploads/<name>' }` (201); **ліміт 20 завантажень за хвилину на акаунт** (429 → `too_many`); читання `GET /uploads/:name` (R2 чи диск — `storage/images.ts`, `r2.ts`; для клієнта однаково);
> - веб API: `apps/web/src/api.ts` — `getQuiz(id)` (`fetchData<Quiz>`, сервер повертає `{ id, ...quiz }`), `createQuiz(quiz)` → `{ ok, id }`, `uploadImage(file)`, `uploadAudio(file)` (→ `ApiResult<{ url }>`, помилки `bad_image`, `too_large`, `bad_audio`, `audio_too_large`, `storage_unavailable`, `too_many`, `offline`, `unauthorized`); тіло JSON ≤ 512 КБ (`BODY_LIMIT`, `apps/server/src/app.ts` ~76); `POST /api/quizzes` робить `quizSchema.safeParse(upgradeQuiz(body))` (`account-routes.ts` ~121);
> - «Мої вікторини»: `apps/web/src/pages/Quizzes.tsx` (маршрут `/quizzes`; `div.toolbar` з «Нова вікторина», «Додати приклад», «Довідка»; у кожній `li.panel` — `div.toolbar` з «Грати», «Автопілот», «Редагувати», «Видалити»; `run(action)` з `busy`, `fail(code)` → `errorText`); окремого меню вікторини (AuthorMenu) **немає**; тест — `pages/Quizzes.test.tsx`;
> - редактор: `pages/EditQuiz.tsx` (`/quizzes/:id`), типові значення — `editor/draft.ts` (`newQuestion`: `timeLimit: LIMITS.defaultTime` = 30, `points: LIMITS.defaultPoints` = 1000; `newClassicRound()`: `speedBonus: true`, `shuffleOptions: false`, `rules: defaultRules()`; `newQuiz()`: `settings: { ...DEFAULT_SETTINGS }`), `editor/new-id.ts` (`newId()`);
> - з плану 41: `apps/web/src/share-image.ts` — `safeFileName(prefix, name)` (регулярка `[^\p{L}\p{N}]+` → `-`, завжди `.png`), `downloadPng(blob, fileName)` (`<a download>`, `revokeObjectURL` через 1 с);
> - CSV: `apps/web/src/locales/csv.ts` — `parseCsv(text)` (RFC 4180, BOM, лише кома, **порожні рядки пропускає**), `toCsv`;
> - fflate 0.8.3 (MIT) уже є в `pnpm-lock.yaml` транзитивно (через `@types/three`), але не в залежностях `apps/web`;
> - i18n: uk — `apps/web/src/i18n.ts` (`t`, `countText(base, count)` для `_one/_few/_many`, `errorText(code)` → `err_<code>`, `roundN: 'Раунд {index}'`, `currentLocale()` з `locales/current.ts`), шість локалей `apps/web/src/locales/{en,pl,de,es,it,ar}.json`; останні списки — `ADDED_RESULT_IMAGE`, `ADDED_DUEL_BETS_PLURALS` (`apps/web/src/i18n.test.ts` ~189–191, перевірка локалей ~409–421, умова `adds no uk keys…` ~469); `source-scan.test.ts` — Cyrillic лише в `ALLOWED` (`i18n.ts`, `help/help-uk.ts`, `push/push-strings.ts`, `locales/grammar.ts`, `locales/locales.ts`, `locales/review-sheet.ts`, `demo-quiz.ts`) і тестах/фікстурах;
> - довідка: `apps/web/src/help/host-help.ts` (`SETTING_HELP_KEYS` ~13, останній — `'groups'`), `help/help-uk.ts` (`setting.groups.*` ~1185), `help/__fixtures__/help-uk-golden.json`, `locales/*.help.json` (пласкі ключі), `HelpButton({ id })`, `help/help-golden.test.ts` (ключі лише з префіксів `round|question|cell|buff|debuff|setting|team`);
> - діалог-зразок: `apps/web/src/result-image/ResultImage.tsx` ~104 (`role="dialog" aria-modal="true" aria-labelledby`, Escape, пастка Tab) і `prizes/tools/CropDialog.tsx`;
> - e2e-зразки: `part41-result-image.e2e.ts` (`useE2eServer`, `snapshot`, `shot`, світла тема init-скриптом `quiz:theme`, `waitForEvent('download')`), `helpers/common.ts` (`register`, `expectNoSideScroll`, `silentMp3`), `helpers/setup.ts` (`avatarPng`, `base`), завантаження медіа через `page.request.post(\`${base}/api/uploads\`, …)` (`part11g-h-autopilot.e2e.ts` ~718).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** у «Моїх вікторинах» — «Експорт → Файл вікторини» (`.quiz`: zip з `quiz.json` і медіа) і «Експорт → Таблиця (Excel)» (`.xlsx` для варіантів, так/ні, тексту й числа), «Імпорт» `.quiz` / `.xlsx` / `.csv` зі звітом помилок по рядках і «Завантажити шаблон»; імпорт завжди створює нову вікторину й відкриває її в редакторі.

**Архітектура:** усе — у браузері, у новій теці `apps/web/src/quiz-io/`. Чисті шари (тестуються без мережі): `media.ts` (знайти й замінити адреси медіа), `quiz-file.ts` (zip ↔ вміст, ліміти, версія), `xlsx.ts` (власний мінімальний запис/читання поверх fflate + `DOMParser`), `table-words.ts` + `table.ts` (вікторина ↔ рядки таблиці, перевірка й звіт). Мережа — `transfer.ts` (читання медіа, повторне завантаження з урахуванням ліміту 429). Оркестрація — `actions.ts`; UI (`ExportMenu`, `ImportDialog`) вантажить `actions.ts` лише через `import()` у мить дії, тож fflate і решта не потрапляють у головний чанк.

**Технології:** TypeScript, React 19 + Vite + Testing Library (jsdom), fflate 0.8 (MIT), `DOMParser` для читання XML і рядковий запис XML, zod (`quizSchema`), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-import-export-design.md` (38e) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Стан гри не змінюється; якщо виконавцю здасться, що потрібна зміна стану чи сервера, — **зупинитися й спитати контролера**.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у нових списках `ADDED_IMPORT_EXPORT` і `ADDED_IMPORT_EXPORT_PLURALS` у `apps/web/src/i18n.test.ts`; вони — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_RESULT_IMAGE` / `ADDED_DUEL_BETS_PLURALS`). ru немає. Довідка — `help-uk.ts` + golden + шість `*.help.json`.
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`); новий словник слів таблиці `quiz-io/table-words.ts` додається в `ALLOWED`.
- **Імпортованому вмісту ніколи не довіряємо:** лише через `quizSchema` (на клієнті до завантаження медіа й на сервері як завжди) і наявні шляхи завантаження з їхніми лімітами; розміри zip і кожного запису обмежені до розпакування; зайві записи архіву ігноруються; шляхи всередині архіву **ніколи** не стають шляхами файлової системи чи адресами — лише ключами пошуку за точним шаблоном імені.
- Бібліотеки — лише з дозвільною ліцензією і **лише через лінивий `import()`** (fflate — MIT).
- **Нічого, пов'язаного з росією**, — у шаблоні, фікстурах, назвах вікторин і тестах.
- Таймери в шаблоні, демо й фікстурах e2e ≥ 25 с; у шаблоні правильні так/ні — «ні».
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів).
- e2e: нова частина 42 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 42"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px і світла тема.

## Рішення плану (там, де специфікація мовчить)

**Бібліотека для xlsx — власний мінімальний запис і читання (без нової залежності).** SheetJS (`xlsx`, Apache-2.0) у npm застряг на 0.18.5 з відомими CVE (prototype pollution, ReDoS) і важить ~900 КБ; `exceljs` (MIT) — ~1 МБ з залежностями; `read-excel-file`/`write-excel-file` (MIT) тягнуть `@xmldom/xmldom` і два окремі пакети. Потрібне нам — один аркуш, рядки й числа — це ~250 рядків поверх fflate (уже потрібен для `.quiz`) і вбудованого `DOMParser`. Нова залежність одна: `fflate@^0.8.3` у `apps/web/package.json` (`pnpm --filter @quiz/web add fflate@^0.8.3`; версія вже в lock-файлі).

**Формат `.quiz`**
- zip: `quiz.json` = `{ "format": "quiz", "version": 1, "quiz": <Quiz без id> }` (JSON з відступом 2) і `media/<name>` для кожної різної адреси медіа, де `<name>` — ім'я з `/uploads/<name>`. `QUIZ_FILE_VERSION = 1`.
- Адреса медіа — **будь-який рядок** вмісту, що повністю збігається з `MEDIA_URL = /^\/uploads\/([a-z0-9]{16,64}\.(?:jpg|png|webp|mp3|ogg|m4a))$/` (глибокий обхід об'єктів і масивів; без переліку полів — нові типи підхоплюються самі).
- Читання: файл > `QUIZ_FILE_LIMITS.maxBytes` (100 МБ) — `io_too_big` ще до розпакування. `unzipSync(bytes, { filter })`: приймаються лише `quiz.json` (заявлений `originalSize` ≤ `maxJsonBytes` = 1 МБ) і `media/<ім'я за MEDIA_NAME>` (≤ `IMAGE_LIMITS.maxBytes` для jpg/png/webp, ≤ `AUDIO_LIMITS.maxBytes` для mp3/ogg/m4a); решта ігнорується; записів розглядається не більше `maxEntries` = 2000; медіа понад ліміт запам'ятовується як «завелике». Після розпакування довжина має дорівнювати заявленій. Не zip, немає `quiz.json`, не JSON, `format !== 'quiz'` — `io_not_quiz`; `version` не ціле ≥ 1 — `io_not_quiz`; `version > 1` — `io_newer`; `quizSchema.safeParse(upgradeQuiz(quiz))` не пройшов — `io_invalid`; адреса з вмісту без файлу в архіві — `io_media_missing`; файл завеликий — `io_media_too_big`. Медіа, на які вміст не посилається, ігноруються.
- Імпорт: кожна різна адреса завантажується **один раз** послідовно: `jpg/png/webp` → `uploadImage(new File([bytes], name, { type }))`, `mp3/ogg/m4a` → `uploadAudio(...)` (типи: `jpg → image/jpeg`, `png → image/png`, `webp → image/webp`, `mp3 → audio/mpeg`, `ogg → audio/ogg`, `m4a → audio/mp4`). Відповідь `too_many` — чекати `UPLOAD_RETRY_MS` = 15 000 мс і повторити, не більше `UPLOAD_RETRIES` = 8 разів на файл (у UI — «чекаю ліміту»); нова адреса має пройти `IMAGE_URL`/`AUDIO_URL` відповідно, інакше `io_invalid`; інша помилка — код сервера (`bad_image`, `too_large`, …) і зупинка. Потім `replaceMedia` і `createQuiz`. Уже завантажені до помилки файли лишаються в сховищі (як при покинутому редакторі) — прийнятно.
- Назва імпортованої вікторини — як у файлі (без «копії»). Експорт бере вміст із `getQuiz(id)` і прибирає `id`; призи, історія, лайки, статистика туди й не потрапляють.
- Файл: `quizFileName(title, 'quiz')` → `<безпечна назва>.quiz`, порожня — `quiz.quiz`; тип блоба `application/zip`.

**Таблиця**
- Аркуш один; рядок 1 — заголовки, далі запитання. Колонки експорту (у мові інтерфейсу, порядок зі специфікації): Раунд · Тип · Запитання · Правильна відповідь · Варіант 1…Варіант 6 · Бали · Таймер (с) · **Підказка**.
- **«Пояснення» → «Підказка» (`hint`).** Поля «пояснення» в схемі немає; колонка в тій самій позиції пишеться й читається як `hint` і має заголовок «Підказка» (імпорт також розпізнає «Пояснення» як синонім цієї колонки). Див. «Розбіжності» в кінці.
- Імпорт шукає колонки **за заголовками** (будь-яка з 7 мов, без регістру, зайві пробіли й хвіст у дужках «(с)» відкидаються); порядок колонок довільний, невідомі колонки ігноруються. Обов'язкові: Тип, Запитання, Правильна відповідь — немає хоч однієї: `io_missing_columns`. «Варіант N» — слово «Варіант» будь-якою мовою + номер 1–6.
- Слова таблиці (заголовки, назви типів, «так»/«ні») — у словнику `quiz-io/table-words.ts` для всіх 7 мов: перше слово — каноничне (його пише експорт мовою інтерфейсу), решта — синоніми для імпорту. Тип розпізнається також за англійськими ключами `single`, `boolean`, `text`, `numeric`. Окремий словник (не `i18n.ts` + JSON), бо імпорт має знати слова **всіх** мов одразу, а вантажити шість словників по ~250 КБ заради 20 слів — зайве (той самий підхід, що й `push/push-strings.ts`, `locales/locales.ts`).
- Канонічні uk-слова: заголовки `Раунд`, `Тип`, `Запитання`, `Правильна відповідь`, `Варіант`, `Бали`, `Таймер (с)`, `Підказка` (синонім `Пояснення`); типи `варіанти` (синонім `варіант`), `так-ні` (синоніми `так/ні`, `так або ні`), `текст`, `число`; так/ні — `так` / `ні`. Відповідь так/ні також приймає `true`/`false`, `yes`/`no`, `1`/`0` і булеву клітинку xlsx.
- **Що потрапляє в експорт таблиці:** лише запитання **класичних** раундів, які таблиця передає без втрат: `single` без картинок варіантів і з непорожнім текстом кожного варіанта; `boolean`; `text` без `;` у жодному написанні; `numeric` з `tolerance === 0` і без `noOvershoot`; і в усіх — `imageUrl === null`, `video === null`, без `audio` і `reveal`. Решта запитань вікторини (`roundQuestions` усіх раундів мінус експортовані) — «пропущені»; після експорту повідомлення `countText('ioSkipped', N)` (немає пропущених — повідомлення немає). Запасні й дуелі в таблицю не йдуть і не рахуються.
- Експорт значень: Раунд — `round.title`, порожня — `t('roundN', { index })` (номер раунду у вікторині, з 1), щоб безіменні раунди не злились при імпорті; варіанти — правильна відповідь текстом варіанта (якщо тексти варіантів повторюються без огляду на регістр — номером); так/ні — каноничне «так»/«ні»; текст — `accepted.join('; ')`; число, бали, таймер — числові клітинки; підказка — `hint ?? ''`.
- **Імпорт рядків:** повністю порожні рядки пропускаються; номер рядка у звіті — номер рядка аркуша (заголовок — 1; у CSV — номер запису). Даних рядків > `TABLE_LIMITS.maxRows` (500) — `io_too_many_rows`, жодного — `io_empty`. Рядки з однаковою (після `trim`) назвою раунду — один класичний раунд у порядку першої появи; порожня назва — теж окремий раунд з `title: ''`. Раунд — `newClassicRound()` з власними `title` і `questions`; вікторина — `newQuiz()` з `title` з імені файлу (без розширення, `trim`, ≤ 120; порожньо — `t('ioImportedTitle')`), id — `newId()`.
- Перевірки рядка (код → текст `ioProblem_<code>`): `no_question` (порожнє запитання), `question_long` (> 300), `unknown_type`, `no_answer` (порожня правильна відповідь), `few_options` (непорожніх варіантів < 2), `option_long` (> 120), `duplicate_options` (однакові без регістру), `answer_not_option` (ні текст варіанта без регістру, ні номер 1–6 непорожньої колонки «Варіант N»; текст має перевагу над номером), `bad_boolean`, `bad_number` (після прибирання пробілів і заміни коми на крапку — не скінченне число), `answer_long` (> 200 у текстовому написанні), `too_many_answers` (> 10 написань), `bad_points` (не ціле 0–2000), `bad_timer` (не ціле 5–120), `hint_long` (> 200), `round_long` (> 60), `round_full` (101-ше запитання раунду), `too_many_rounds` (11-й раунд), `quiz_full` (201-ше запитання). Порожні Бали / Таймер — 1000 / 30 (`LIMITS.defaultPoints` / `LIMITS.defaultTime`). Рядок може мати кілька помилок — у звіті кожна окремо. Межі в текстах — через `{max}` з `LIMITS`, не літерали.
- Є хоч одна помилка — `{ ok: false, errors }`, нічого не створюється; немає — `quizSchema.safeParse` зібраного (провал — `io_invalid`), потім `createQuiz` і перехід у редактор `/quizzes/<id>`.
- Ліміти файлів таблиці: `.xlsx` ≤ 5 МБ, `.csv` ≤ 2 МБ — інакше `io_too_big`; XML аркуша й `sharedStrings` — заявлений розмір ≤ 20 МБ, інакше `io_too_big`; номер рядка аркуша > 100 000 — `io_too_many_rows`.
- CSV: декодування `new TextDecoder('utf-8', { fatal: true })` (провал — `io_csv_encoding`), роздільник — той, якого більше в першому рядку поза лапками (`;` чи `,`, нічия — `,`), порожні рядки зберігаються (для номерів).
- Шаблон: `quiz-template.xlsx` = заголовки + 4 рядки (раунд `t('ioSampleRound')` «Природа»): варіанти «Яка планета найближча до Сонця?» — Меркурій / Венера / Марс / Земля, правильна «Меркурій», 1000, 30, підказка «Рік на ній триває 88 земних діб»; так-ні «Кит — це риба?» → «ні», 500, 25; текст «Як називається найбільший океан Землі?» → «Тихий; Тихий океан», 1000, 30; число «Скільки ніг у павука?» → 8, 1000, 25. Тексти прикладів — ключі i18n (`ioSample*`), мова — мова інтерфейсу.

**Мінімальний xlsx**
- Запис: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml` (аркуш `Quiz`), `xl/_rels/workbook.xml.rels`, `xl/styles.xml` (2 формати: звичайний і жирний для рядка 1), `xl/worksheets/sheet1.xml` з `<cols>` (ширини) і клітинками: рядок — `t="inlineStr"` з `<is><t xml:space="preserve">`, число — `<v>`, порожньо — клітинки немає. Екранування `& < > " '`; символи, заборонені XML 1.0 (керівні `\x00–\x08\x0B\x0C\x0E–\x1F`), прибираються.
- Читання: `unzipSync` з тим самим `filter`-лімітом; перший аркуш — за `xl/workbook.xml` → `r:id` → `xl/_rels/workbook.xml.rels` (`Target` відносно `xl/`, лише всередині архіву; інакше — `xl/worksheets/sheet1.xml`); `sharedStrings.xml` — `<si>` = з'єднання всіх `<t>` поза `<rPh>`; клітинка `t="s"` — рядок зі спільних, `inlineStr` — `<is>`, `str` — `<v>`, `b` — `'true'`/`'false'`, решта — текст `<v>` (число як є, формула — збережене значення); колонка — з `r="C5"`, без `r` — наступна; рядок — з `<row r>`, пропуски — порожні рядки. Не zip / немає аркуша / XML з `parsererror` — `io_not_table`.

**Тексти (uk)** — список `ADDED_IMPORT_EXPORT`:
`ioExport: 'Експорт'`, `ioExportFile: 'Файл вікторини'`, `ioExportTable: 'Таблиця (Excel)'`, `ioImport: 'Імпорт'`, `ioImportTitle: 'Імпорт вікторини'`, `ioImportHint: 'Файл вікторини (.quiz) або таблиця (.xlsx, .csv). Завжди створюється нова вікторина.'`, `ioChooseFile: 'Вибрати файл'`, `ioTemplate: 'Завантажити шаблон'`, `ioClose: 'Закрити'`, `ioPreparing: 'Готую файл…'`, `ioChecking: 'Перевіряю файл…'`, `ioMedia: 'Медіа: {done} з {total}'`, `ioWaitLimit: 'Забагато завантажень поспіль — чекаю хвилинку…'`, `ioCreating: 'Створюю вікторину…'`, `ioErrorsTitle: 'У таблиці є помилки — нічого не створено:'`, `ioRowError: 'Рядок {row}: {problem}'`, `ioMoreErrors: '…і ще {count}'`, `ioImportedTitle: 'Імпортована вікторина'`, `ioSampleRound`, `ioSampleChoice`, `ioSampleOption1`…`ioSampleOption4`, `ioSampleChoiceHint`, `ioSampleYesNo`, `ioSampleText`, `ioSampleTextAnswers`, `ioSampleNumber` (тексти — з «Шаблону»), `ioProblem_no_question: 'немає тексту запитання'`, `ioProblem_question_long: 'запитання довше за {max} символів'`, `ioProblem_unknown_type: 'невідомий тип (варіанти, так-ні, текст чи число)'`, `ioProblem_no_answer: 'немає правильної відповіді'`, `ioProblem_few_options: 'потрібно щонайменше {max} варіанти'`, `ioProblem_option_long: 'варіант довший за {max} символів'`, `ioProblem_duplicate_options: 'варіанти повторюються'`, `ioProblem_answer_not_option: 'правильна відповідь не збігається з жодним варіантом'`, `ioProblem_bad_boolean: 'відповідь має бути «так» або «ні»'`, `ioProblem_bad_number: 'відповідь має бути числом'`, `ioProblem_answer_long: 'відповідь довша за {max} символів'`, `ioProblem_too_many_answers: 'більше {max} відповідей'`, `ioProblem_bad_points: 'бали — ціле число від 0 до {max}'`, `ioProblem_bad_timer: 'таймер — ціле число секунд від {min} до {max}'`, `ioProblem_hint_long: 'підказка довша за {max} символів'`, `ioProblem_round_long: 'назва раунду довша за {max} символів'`, `ioProblem_round_full: 'у раунді вже {max} запитань'`, `ioProblem_too_many_rounds: 'більше {max} раундів'`, `ioProblem_quiz_full: 'у вікторині вже {max} запитань'`, `err_io_not_quiz: 'Це не файл вікторини.'`, `err_io_newer: 'Файл з новішої версії додатку. Оновіть сторінку й спробуйте ще раз.'`, `err_io_invalid: 'Вміст файлу пошкоджений або не підходить.'`, `err_io_too_big: 'Файл завеликий.'`, `err_io_media_missing: 'У файлі бракує картинок чи аудіо.'`, `err_io_media_too_big: 'Картинка чи аудіо у файлі завеликі.'`, `err_io_media_fetch: 'Не вдалося прочитати картинки чи аудіо вікторини.'`, `err_io_unknown_file: 'Виберіть файл .quiz, .xlsx або .csv.'`, `err_io_not_table: 'Не вдалося прочитати таблицю.'`, `err_io_csv_encoding: 'Збережіть CSV у кодуванні UTF-8.'`, `err_io_missing_columns: 'Немає потрібних колонок: Тип, Запитання, Правильна відповідь.'`, `err_io_too_many_rows: 'У таблиці понад 500 рядків — розділіть її.'`, `err_io_empty: 'У таблиці немає запитань.'`.
Список `ADDED_IMPORT_EXPORT_PLURALS`: `ioSkipped_one: 'Пропущено {count} запитання інших типів чи з медіа (воно є лише у файлі вікторини)'`, `ioSkipped_few: 'Пропущено {count} запитання інших типів чи з медіа (вони є лише у файлі вікторини)'`, `ioSkipped_many: 'Пропущено {count} запитань інших типів чи з медіа (вони є лише у файлі вікторини)'`.

**Де кнопки**
- «Мої вікторини», верхній `div.toolbar`: після «Додати приклад» — «Імпорт» (`className="btn"`), відкриває `ImportDialog`.
- У кожній `li.panel`, перед «Видалити»: `ExportMenu` — `<details className="io-export">` з `<summary className="btn">Експорт</summary>` і двома кнопками «Файл вікторини», «Таблиця (Excel)»; під час експорту — `role="status"` з прогресом у цьому ж `li`, після — `ioSkipped` (якщо N > 0), помилка — `role="alert"`. У редакторі експорту немає (там незбережені зміни).
- `ImportDialog`: заголовок «Імпорт вікторини», `ioImportHint`, `HelpButton id="setting.importExport"`, `<input type="file" accept=".quiz,.xlsx,.csv">` за кнопкою «Вибрати файл», «Завантажити шаблон», «Закрити»; прогрес — `role="status"`; помилки рядків — `ioErrorsTitle` + `<ul>` перших 50 (`ioRowError`) + `ioMoreErrors`; інша помилка — `role="alert"` з `errorText`. Поки йде імпорт, «Закрити»/Escape вимкнені.

## Порядок збирання

- Залежності: 1 — незалежна; 2 ← 1; 3 ← 1 (fflate); 4 ← 3; 5 ← 1, 2, 4; 6 ← 5; 7 ← 6; 8 — остання.
- Кожна задача лишає `pnpm typecheck` зеленим; UI з'являється лише в задачі 6.

## Фокус рев'ю

1. **Ворожий архів.** Zip-бомба (заявлено 1 ГБ у `quiz.json`), запис `../../etc/passwd`, `media/../x.png`, `media/ABC.png` (не наш шаблон), 5000 записів, медіа без посилань, посилання на чужу адресу без файлу — нічого не розпаковується понад ліміт, жоден шлях не вживається, зайве ігнорується, бракуюче — `io_media_missing`. Задача 1.
2. **Таблиця з Excel і Google Таблиць.** Спільні рядки з форматуванням (`<r>`), числа в клітинках відповіді й балів (`1000`, `0.5`), булева клітинка, пропущені клітинки без `r`, порожні рядки посередині (номери у звіті збігаються з аркушем), CSV з `;` і комою в десятковому числі, CSV в cp1251 — зрозуміла відмова. Задачі 3, 4.
3. **Ліміт завантажень.** Вікторина з 30 картинками впирається в 20/хв: імпорт чекає й продовжує, прогрес чесний, повторна адреса вантажиться раз; `unauthorized` посеред імпорту — зупинка без вікторини. Задача 2.
4. **Туди й назад без втрат.** `.quiz` → новий імпорт дає той самий вміст (крім адрес медіа) для всіх типів раундів, зі `spares` і `duels`; таблиця туди й назад — ті самі 4 типи, раунди, бали, таймери, підказки; запитання з медіа чи відхиленням — у «пропущених», а не зіпсовані. Задачі 4, 5, 8.
5. **Головний чанк і телефон.** fflate і модулі `quiz-io` не імпортуються статично зі сторінок; діалог і меню на 360 px без бокового скролу в обох темах; повторне натискання під час експорту/імпорту нічого не дублює. Задачі 6, 8.

---

### Задача 1. Веб: адреси медіа й формат `.quiz` (`quiz-io/media.ts`, `quiz-io/quiz-file.ts`)

**Files:**
- Modify: `apps/web/package.json` (+ `fflate: ^0.8.3`), `pnpm-lock.yaml` (через `pnpm --filter @quiz/web add fflate@^0.8.3`)
- Modify: `apps/web/src/share-image.ts` — виділити `safeSlug(name)` (та сама регулярка) і `downloadFile(blob, fileName)` (тіло нинішнього `downloadPng`); `safeFileName` і `downloadPng` лишаються з тією самою поведінкою через них.
- Create: `apps/web/src/quiz-io/media.ts`, `apps/web/src/quiz-io/media.test.ts`, `apps/web/src/quiz-io/quiz-file.ts`, `apps/web/src/quiz-io/quiz-file.test.ts`

**Interfaces (Produces):**
```ts
// share-image.ts
export function safeSlug(name: string): string;            // '' коли нічого не лишилось
export function downloadFile(blob: Blob, fileName: string): void;
// media.ts
export const MEDIA_URL: RegExp;                            // з «Рішень»
export const MEDIA_NAME: RegExp;                           // /^[a-z0-9]{16,64}\.(jpg|png|webp|mp3|ogg|m4a)$/
export type MediaKind = 'image' | 'audio';
export function mediaKind(name: string): MediaKind;
export function mediaType(name: string): string;           // MIME за розширенням
export function mediaUrls(value: unknown): string[];       // різні, у порядку першої появи
export function replaceMedia<T>(value: T, map: ReadonlyMap<string, string>): T; // нова копія, оригінал не змінюється
export function quizFileName(title: string, ext: 'quiz' | 'xlsx'): string;
// quiz-file.ts
export const QUIZ_FILE_VERSION = 1;
export const QUIZ_FILE_LIMITS: { maxBytes: number; maxJsonBytes: number; maxEntries: number };
export type IoError = 'io_not_quiz' | 'io_newer' | 'io_invalid' | 'io_too_big' | 'io_media_missing' | 'io_media_too_big';
export function buildQuizFile(quiz: Quiz, media: ReadonlyMap<string, Uint8Array>): Uint8Array; // ключ — ім'я файлу
export function readQuizFile(bytes: Uint8Array):
  | { ok: true; quiz: Quiz; media: Map<string, Uint8Array> }   // лише медіа, на які посилається quiz
  | { ok: false; error: IoError };
```

- [ ] **Step 1: Write the failing tests:**
  - `media.test.ts`:
    - `mediaUrls finds every upload in any field` — вікторина з `imageUrl` запитання, `imageUrl` варіанта, `audio: { source: 'file', url }`, `jigsaw.photo`, `spotdiff.original/changed`, тією самою адресою двічі та YouTube `video` → рівно ці адреси без повторів, у порядку появи; рядок `'/uploads/x.png'` (коротке ім'я) і `'https://a/uploads/<32 hex>.png'` — не адреси.
    - `replaceMedia swaps whole strings and keeps the original` — мапа старої → нової адреси; текст запитання, що лише **містить** адресу, не змінюється; вихідний об'єкт `toEqual` копії до виклику.
    - `mediaType by extension` — `jpg → image/jpeg`, `m4a → audio/mp4`; `mediaKind('a.ogg') === 'audio'`.
    - `quizFileName` — `('Зимова вікторина!', 'quiz')` → `'Зимова-вікторина.quiz'`; `(' ?! ', 'xlsx')` → `'quiz.xlsx'`.
  - `quiz-file.test.ts` (вікторина — `makeRoundsQuiz` з `@quiz/engine/testing` або власна мала фікстура, що проходить `quizSchema`; медіа — по кілька байтів):
    - `round trip keeps the quiz and the referenced media` — `readQuizFile(buildQuizFile(quiz, media))` → `quiz` `toEqual` вихідному, `media` — ті самі байти.
    - `quiz.json carries the format and version` — `unzipSync` результату: `JSON.parse(quiz.json)` має `format: 'quiz'`, `version: 1`, немає `id`.
    - `a newer version is refused` — `version: 2` → `io_newer`; `version: '1'` чи `0` → `io_not_quiz`.
    - `not a quiz file` — випадкові байти, zip без `quiz.json`, `quiz.json` не JSON, `format: 'other'` → `io_not_quiz`.
    - `content that fails the schema` — `title: ''` → `io_invalid`; старий формат (`questions` без `rounds`) → `ok: true` з одним класичним раундом (`upgradeQuiz`).
    - `missing media` — адреса у вмісті без файлу → `io_media_missing`.
    - `too big` — `bytes.length > maxBytes` (підмінний `Uint8Array` з `length`, без виділення 100 МБ: перевірка йде до розпакування) → `io_too_big`; `quiz.json` із заявленим розміром понад 1 МБ → `io_too_big`; картинка понад 2 МБ → `io_media_too_big`.
    - `stray entries are ignored` — записи `../evil.png`, `media/../x.png`, `media/ABC.png`, `other.txt`, `media/<ім'я без посилань>` → `ok: true`, у `media` їх немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io apps/web/src/share-image.test.ts`. Expected: FAIL (модулів немає).
- [ ] **Step 3: Implement** за Interfaces і «Формат `.quiz`» (`zipSync` з `level: 0` для медіа й `6` для `quiz.json`; `unzipSync` з `filter`, перевірка довжини після розпакування; будь-який виняток fflate — `io_not_quiz`).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io apps/web/src/share-image.test.ts apps/web/src/trophy/diploma.test.ts apps/web/src/result-image && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/share-image.ts apps/web/src/quiz-io/media.ts apps/web/src/quiz-io/media.test.ts apps/web/src/quiz-io/quiz-file.ts apps/web/src/quiz-io/quiz-file.test.ts
git commit -m "feat(web): 42 import export — the .quiz file: quiz.json with a format version and the referenced media in a zip, size limits before unpacking, stray archive entries ignored, newer versions refused"
```

---

### Задача 2. Веб: читання й повторне завантаження медіа (`quiz-io/transfer.ts`)

**Files:**
- Create: `apps/web/src/quiz-io/transfer.ts`, `apps/web/src/quiz-io/transfer.test.ts`

**Interfaces:**
- Consumes: `mediaKind`, `mediaType`, `MEDIA_URL` (задача 1); `uploadImage`, `uploadAudio` (`api.ts`); `IMAGE_URL`, `AUDIO_URL` (`@quiz/shared`).
- Produces:
```ts
export const UPLOAD_RETRY_MS = 15_000;
export const UPLOAD_RETRIES = 8;
export type TransferProgress = { stage: 'media'; done: number; total: number } | { stage: 'wait' };
export class TransferError extends Error { constructor(readonly code: string) }
/** GET кожної адреси (same-origin); не 200 — TransferError('io_media_fetch'). Ключ — ім'я файлу. */
export function fetchMedia(urls: string[], onProgress: (p: TransferProgress) => void): Promise<Map<string, Uint8Array>>;
/** Послідовно, по одному разу на ім'я; too_many — чекає wait(UPLOAD_RETRY_MS) і повторює ≤ UPLOAD_RETRIES; повертає стара адреса → нова. */
export function uploadMedia(
  media: ReadonlyMap<string, Uint8Array>,
  onProgress: (p: TransferProgress) => void,
  wait?: (ms: number) => Promise<void>,
): Promise<Map<string, string>>;
```

- [ ] **Step 1: Write the failing tests** (`vi.mock('../api')`, `fetch` — `vi.stubGlobal`; `wait` — миттєва заглушка-spy):
  - `uploads images and audio through their routes` — `a….png` і `b….mp3` → `uploadImage` з `File` типу `image/png`, `uploadAudio` з `audio/mpeg`; мапа `'/uploads/a….png' → нова адреса`; прогрес `{ media, 1, 2 }`, `{ media, 2, 2 }`.
  - `waits and retries on too_many` — перші дві відповіді `{ ok: false, error: 'too_many' }`, третя — успіх → `wait` двічі з `15_000`, прогрес `{ stage: 'wait' }`, результат є.
  - `gives up after the retries` — 9 разів `too_many` → `TransferError('too_many')`.
  - `stops on another error` — `too_large` → `TransferError('too_large')`, наступний файл не вантажиться.
  - `refuses a foreign returned address` — сервер повернув `'https://evil/x.png'` → `TransferError('io_invalid')`.
  - `fetchMedia reads bytes and fails on 404` — 200 → байти під ключем-ім'ям; 404 → `TransferError('io_media_fetch')`; `offline` (`fetch` кидає) → `TransferError('io_media_fetch')`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io/transfer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces (типова `wait` — `setTimeout`-проміс).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/quiz-io/transfer.ts apps/web/src/quiz-io/transfer.test.ts
git commit -m "feat(web): 42 import export — media transfer: read a quiz's uploads for export, upload each imported file once through the existing routes, wait out the 20 per minute limit, refuse a foreign returned address"
```

---

### Задача 3. Веб: мінімальний xlsx і CSV з крапкою з комою (`quiz-io/xlsx.ts`, `locales/csv.ts`)

**Files:**
- Create: `apps/web/src/quiz-io/xlsx.ts`, `apps/web/src/quiz-io/xlsx.test.ts`
- Modify: `apps/web/src/locales/csv.ts`, `apps/web/src/locales/csv.test.ts` — `parseCsv(text, options?)`, `detectDelimiter(text)`

**Interfaces (Produces):**
```ts
// xlsx.ts
export type XlsxCell = string | number | null;
export const XLSX_LIMITS: { maxPartBytes: number; maxRow: number }; // 20 МБ, 100 000
export function writeXlsx(rows: XlsxCell[][], options?: { boldFirstRow?: boolean; widths?: number[] }): Uint8Array;
/** Перший аркуш; rows[i] — рядок аркуша i + 1 (пропуски — []), клітинки — рядки ('' для порожніх). */
export function readXlsx(bytes: Uint8Array): { ok: true; rows: string[][] } | { ok: false; error: 'io_not_table' | 'io_too_big' | 'io_too_many_rows' };
// locales/csv.ts
export function detectDelimiter(text: string): ',' | ';';
export function parseCsv(text: string, options?: { delimiter?: ',' | ';'; keepEmpty?: boolean }): string[][];
```

- [ ] **Step 1: Write the failing tests:**
  - `xlsx.test.ts` (jsdom, `DOMParser`):
    - `write then read gives the same cells` — `[['Раунд', 'Тип'], ['Природа', 'число', 8, null, 'a & <b> "c"']]` → `[['Раунд', 'Тип'], ['Природа', 'число', '8', '', 'a & <b> "c"']]`.
    - `written parts are a valid workbook` — `unzipSync` має `[Content_Types].xml`, `xl/workbook.xml`, `xl/worksheets/sheet1.xml`, `xl/styles.xml`; кожна XML-частина без `parsererror` у `DOMParser`; рядок 1 має `s="1"` при `boldFirstRow`.
    - `control characters are dropped` — `'a\u0001b'` → прочитано `'ab'`.
    - `reads shared strings with rich runs` — вручну зібраний `zipSync` (фікстура як у Excel: `sharedStrings.xml` з `<si><r><t>Мер</t></r><r><t>курій</t></r><rPh><t>x</t></rPh></si>`, `t="s"`) → `'Меркурій'`.
    - `reads numbers, booleans, formulas and gaps like Google Sheets` — клітинки `B1` (без `A1`), `t="b"` `<v>1</v>` → `'true'`, `<f>…</f><v>42</v>` → `'42'`, `<row r="4">` після `r="2"` → `rows[2]` = `[]`; клітинки без `r` — по черзі.
    - `follows the workbook relation to the first sheet` — аркуш у `xl/worksheets/data.xml` через `workbook.xml.rels` → прочитано; `Target="../../x.xml"` → резерв `sheet1.xml`, немає — `io_not_table`.
    - `refuses what is not a table` — випадкові байти, zip без аркуша, аркуш з битим XML → `io_not_table`; аркуш із заявленим розміром > 20 МБ → `io_too_big`; `<row r="200000">` → `io_too_many_rows`.
  - `csv.test.ts` (наявні тести не змінюються):
    - `detectDelimiter picks the more frequent outside quotes` — `'a;b;"c,d"\n'` → `';'`; `'a,b\n'` → `','`; `'a\n'` → `','`.
    - `parseCsv with a semicolon` — `'Тип;Запитання\r\nчисло;"Скільки; ніг?"\r\n'`, `{ delimiter: ';' }` → `[['Тип', 'Запитання'], ['число', 'Скільки; ніг?']]`.
    - `keepEmpty keeps blank lines for row numbers` — `'a\n\nb\n'` → `[['a'], [''], ['b']]`; без опції — як було `[['a'], ['b']]`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io/xlsx.test.ts apps/web/src/locales/csv.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Мінімальний xlsx» (XML пишеться рядками з екрануванням; читання — `DOMParser` `application/xml`, елементи шукати за `localName`, бо Excel пише префікси просторів імен).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io apps/web/src/locales && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/quiz-io/xlsx.ts apps/web/src/quiz-io/xlsx.test.ts apps/web/src/locales/csv.ts apps/web/src/locales/csv.test.ts
git commit -m "feat(web): 42 import export — a minimal xlsx writer and reader over fflate and DOMParser (inline and shared strings, numbers, booleans, gaps, the first sheet by relation, size limits) and CSV with a semicolon and kept blank lines"
```

---

### Задача 4. Веб: вікторина ↔ таблиця, перевірка рядків і шаблон (`quiz-io/table-words.ts`, `quiz-io/table.ts`)

**Files:**
- Create: `apps/web/src/quiz-io/table-words.ts`, `apps/web/src/quiz-io/table.ts`, `apps/web/src/quiz-io/table.test.ts`
- Modify: `apps/web/src/source-scan.test.ts` — `'quiz-io/table-words.ts'` в `ALLOWED`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` — **усі** ключі з «Текстів (uk)» і обидва списки `ADDED_IMPORT_EXPORT`, `ADDED_IMPORT_EXPORT_PLURALS` (у списках, у перевірці локалей і в умові `adds no uk keys…`), щоб задачі 5–6 лише вживали готові ключі

**Interfaces:**
- Consumes: `XlsxCell` (задача 3); `newQuiz`, `newClassicRound` (`editor/draft.ts`), `newId`; `LIMITS`, `quizSchema`, `roundQuestions` (`@quiz/shared`); `t`, `currentLocale`.
- Produces:
```ts
// table-words.ts
export type ColumnKey = 'round' | 'type' | 'question' | 'answer' | 'option' | 'points' | 'timer' | 'hint';
export type TableType = 'single' | 'boolean' | 'text' | 'numeric';
export interface TableWords { columns: Record<ColumnKey, string[]>; types: Record<TableType, string[]>; yes: string[]; no: string[] } // [0] — каноничне
export const TABLE_WORDS: Record<Locale, TableWords>;
export function normalizeWord(value: string): string; // NFC, нижній регістр, пробіли (зокрема NBSP) згорнуто, trim, хвіст «(…)» прибрано
// table.ts
export const TABLE_LIMITS: { maxRows: number; maxXlsxBytes: number; maxCsvBytes: number }; // 500, 5 МБ, 2 МБ
export type TableProblem = 'no_question' | 'question_long' | 'unknown_type' | 'no_answer' | 'few_options' | 'option_long' | 'duplicate_options' | 'answer_not_option' | 'bad_boolean' | 'bad_number' | 'answer_long' | 'too_many_answers' | 'bad_points' | 'bad_timer' | 'hint_long' | 'round_long' | 'round_full' | 'too_many_rounds' | 'quiz_full';
export interface RowError { row: number; code: TableProblem }
export function tableRepresentable(question: Question): boolean;
export function quizToRows(quiz: Quiz): { rows: XlsxCell[][]; skipped: number }; // рядок 0 — заголовки мовою інтерфейсу
export function templateRows(): XlsxCell[][];
export function rowsToQuiz(rows: string[][], title: string):
  | { ok: true; quiz: Quiz }
  | { ok: false; error: 'io_missing_columns' | 'io_too_many_rows' | 'io_empty' | 'io_invalid' }
  | { ok: false; errors: RowError[] };
export function problemText(error: RowError): string; // t('ioRowError', { row, problem: t(`ioProblem_${code}`, { min, max }) })
```

- [ ] **Step 1: Write the failing tests** (`table.test.ts`; рядки таблиці — масиви рядків з uk-заголовками, якщо не сказано інакше):
  - `exports the four simple types of classic rounds` — класичний раунд «Природа» з `single` (правильний — 2-й варіант), `boolean` (`correct: false`), `text` (`['Тихий', 'Тихий океан']`), `numeric` (`8`) → заголовки `['Раунд', 'Тип', 'Запитання', 'Правильна відповідь', 'Варіант 1', …, 'Варіант 6', 'Бали', 'Таймер (с)', 'Підказка']`, рядки з `'варіанти'`/`'так-ні'`/`'текст'`/`'число'`, відповіді `'Венера'`, `'ні'`, `'Тихий; Тихий океан'`, `8`; бали й таймер — числа; `skipped: 0`.
  - `skips what the table cannot carry` — `multi`, `pin`, `single` з `imageUrl` запитання, `single` з картинкою варіанта, `numeric` з `tolerance: 1`, `numeric` з `noOvershoot`, `text` з `'a;b'`, `boolean` з `audio`, будь-яке запитання бліцу → не в рядках, `skipped` = їхня кількість.
  - `an untitled round gets its number` — другий раунд з `title: ''` → `'Раунд 2'`.
  - `headers follow the interface language` — `activateLocaleForTests('en', …)` зі справжнім `en.json` → перший заголовок `TABLE_WORDS.en.columns.round[0]`.
  - `round trip of the four types` — `rowsToQuiz(quizToRows(quiz).rows як рядки, 'Природа')` → ті самі `text`, `type`, варіанти, правильні відповіді, `points`, `timeLimit`, `hint`, раунди за назвами; id нові.
  - `reads headers in any language, any order and case` — колонки `QUESTION`/`Type`/`Correct answer` англійською (з `TABLE_WORDS.en`) у переставленому порядку, ще одна невідома колонка → `ok: true`; польські назви типів і `'single'` → розпізнано; `'Таймер'` без «(с)» і `'Пояснення'` → колонки таймера й підказки.
  - `missing required columns` — без «Правильна відповідь» → `io_missing_columns`.
  - `defaults for empty points and timer` — порожні → `points: 1000`, `timeLimit: 30`; `'1 500'` → `1500`.
  - `choice answer by text or number` — `'меркурій'` (інший регістр) → правильний «Меркурій»; `'2'` при варіантах без «2» серед текстів → другий варіант; варіанти в колонках 1, 3, 4 (2 порожня) і відповідь `'3'` → варіант з колонки 3; `'2'` (порожня колонка) → `answer_not_option`.
  - `number with a comma` — `'3,5'` → `3.5`; `'12 000'` → `12000`; `'абв'` → `bad_number`.
  - `yes and no in many forms` — `'Так'`, `'ні'`, `'TRUE'`, `'no'`, `'0'` → булеві; `'може'` → `bad_boolean`.
  - `row report with sheet row numbers` — заголовок, порожній рядок, рядок без правильної відповіді (рядок аркуша 3), рядок з одним варіантом і балами `5000` (рядок 4) → `errors` = `[{ row: 3, code: 'no_answer' }, { row: 4, code: 'few_options' }, { row: 4, code: 'bad_points' }]`; `problemText({ row: 3, code: 'no_answer' })` = `'Рядок 3: немає правильної відповіді'`.
  - `one problem per rule` — по одному рядку на кожен код з `TableProblem` (крім `round_full`, `too_many_rounds`, `quiz_full`) → саме цей код.
  - `limits of rounds and questions` — 11 різних назв раундів → `too_many_rounds` на першому рядку 11-го; 101 рядок одного раунду → `round_full` на 101-му; 201 рядок у 3 раундах → `quiz_full` на 201-му; 501 непорожній рядок → `io_too_many_rows`; лише заголовок → `io_empty`.
  - `rows with the same round go together in order` — `А, Б, А` → два раунди: `А` (рядки 1 і 3), `Б`.
  - `title comes from the caller` — `rowsToQuiz(rows, '')` → `t('ioImportedTitle')`; назва 200 символів → обрізано до 120; результат проходить `quizSchema`.
  - `template has four valid examples` — `templateRows()`: заголовок + 4 рядки, типи `варіанти`/`так-ні`/`текст`/`число`, так-ні = `'ні'`, кожен таймер ≥ 25; `rowsToQuiz` шаблону → `ok: true`, 4 запитання.
  - `table words cover every locale` — для кожної з 7 мов кожен `ColumnKey`, `TableType`, `yes`, `no` мають ≥ 1 непорожнє слово; `normalizeWord` усіх слів одного ключа не збігається зі словами іншого ключа тієї ж мови (немає двозначностей).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io/table.test.ts apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Таблиця» (переклади слів таблиці й текстів — виконавець, ru немає, арабська — арабською).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/quiz-io/table-words.ts apps/web/src/quiz-io/table.ts apps/web/src/quiz-io/table.test.ts apps/web/src/source-scan.test.ts apps/web/src/i18n.ts apps/web/src/locales apps/web/src/i18n.test.ts
git commit -m "feat(web): 42 import export — the quiz table: four simple types of classic rounds to rows and back, headers and type names in seven languages, a per-row report with sheet row numbers, editor defaults, the template with four examples, texts in seven languages"
```

---

### Задача 5. Веб: дії експорту й імпорту (`quiz-io/actions.ts`)

**Files:**
- Create: `apps/web/src/quiz-io/actions.ts`, `apps/web/src/quiz-io/actions.test.ts`

**Interfaces:**
- Consumes: усе з задач 1–4; `getQuiz`, `createQuiz` (`api.ts`); `downloadFile` (задача 1).
- Produces:
```ts
export type IoProgress = { stage: 'preparing' | 'checking' | 'creating' } | TransferProgress;
export type IoFailure = { ok: false; error: string } | { ok: false; errors: RowError[] }; // error — код для errorText
export function exportQuizFile(id: string, onProgress: (p: IoProgress) => void): Promise<{ ok: true } | IoFailure>;
export function exportQuizTable(id: string): Promise<{ ok: true; skipped: number } | IoFailure>;
export function downloadTemplate(): void;
/** За розширенням (.quiz / .xlsx / .csv, без регістру); успіх — id нової вікторини. */
export function importQuizFile(file: File, onProgress: (p: IoProgress) => void): Promise<{ ok: true; id: string } | IoFailure>;
```

- [ ] **Step 1: Write the failing tests** (`vi.mock('../api')`, `vi.mock('./transfer')` там, де мережа не головна; `downloadFile` — spy через `vi.mock('../share-image', …)` з рештою справжнього модуля):
  - `exports a quiz file without the id` — `getQuiz` → `{ id: 'q1', ...quiz з двома картинками }` → `fetchMedia` з двома адресами, `downloadFile` з `Blob` типу `application/zip` і ім'ям `'<Назва>.quiz'`; `readQuizFile` байтів блоба → той самий вміст без `id`; прогрес `preparing` → `media`.
  - `exports a table and counts the skipped` — вікторина з 4 простими й 2 іншими → `{ ok: true, skipped: 2 }`, `downloadFile` з ім'ям `'<Назва>.xlsx'`.
  - `export failures come back as codes` — `getQuiz` `{ ok: false, error: 'not_found' }` → `{ ok: false, error: 'not_found' }`; `fetchMedia` кидає `TransferError('io_media_fetch')` → цей код, `downloadFile` не викликано.
  - `imports a quiz file with new media addresses` — `.quiz` з `buildQuizFile` → `uploadMedia` з медіа архіву, `createQuiz` з вмістом, де всі адреси — нові з мапи; `{ ok: true, id }`; прогрес `checking` → `media` → `creating`.
  - `a newer file creates nothing` — `version: 2` → `{ ok: false, error: 'io_newer' }`, ні `uploadMedia`, ні `createQuiz`.
  - `imports an xlsx and a csv table` — `writeXlsx(templateRows())` як `File('Мій квіз.xlsx')` → `createQuiz` з `title: 'Мій квіз'`, 4 запитання; CSV `;` з тими самими рядками (`toCsv`-подібний текст з BOM) → те саме.
  - `row errors create nothing` — таблиця з рядком без відповіді → `{ ok: false, errors: [{ row: 2, code: 'no_answer' }] }`, `createQuiz` не викликано.
  - `refuses unknown, too big and non-UTF-8 files` — `notes.txt` → `io_unknown_file`; `.xlsx` понад 5 МБ і `.csv` понад 2 МБ (`File` з `size` через `Object.defineProperty`) → `io_too_big`; CSV з байтами cp1251 → `io_csv_encoding`.
  - `server refusal is passed on` — `createQuiz` `{ ok: false, error: 'invalid_payload' }` → цей код; `uploadMedia` кидає `TransferError('unauthorized')` → `unauthorized`.
  - `template download` — `downloadTemplate()` → `downloadFile` з ім'ям `'quiz-template.xlsx'`; `readXlsx` → 5 рядків.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces (`File.arrayBuffer()`; тип xlsx-блоба `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; `TransferError` → `{ ok: false, error: code }`).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/quiz-io/actions.ts apps/web/src/quiz-io/actions.test.ts
git commit -m "feat(web): 42 import export — export a quiz file or a table, download the template, import .quiz, .xlsx or .csv into a new quiz through the existing save API, nothing created on any error"
```

---

### Задача 6. Веб: «Експорт» і «Імпорт» у «Моїх вікторинах» (`ExportMenu`, `ImportDialog`)

**Files:**
- Create: `apps/web/src/quiz-io/ExportMenu.tsx`, `apps/web/src/quiz-io/ImportDialog.tsx`, `apps/web/src/quiz-io/ui.test.tsx`, `apps/web/src/quiz-io/lazy.test.ts`
- Modify: `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `actions.ts` (задача 5) — **лише** `const io = await import('./actions')` у обробниках; `problemText`, `RowError` — тип через `import type`, текст помилок рядків — з функції, яку повертає той самий `import()` (статично `table.ts` не тягнути); `errorText`, `t`, `countText`, `HelpButton`.
- Produces:
```tsx
export function ExportMenu({ quizId, disabled }: { quizId: string; disabled?: boolean }): JSX.Element;
/** Імпорт: успіх — onImported(id) (сторінка переходить у редактор). */
export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests:**
  - `ui.test.tsx` (`vi.mock('./actions')`):
    - `export menu offers the file and the table` — клік по «Експорт» відкриває «Файл вікторини» і «Таблиця (Excel)»; «Файл вікторини» → `exportQuizFile('q1', …)`; під час дії обидві кнопки `disabled`, `role="status"` = «Медіа: 1 з 3» з прогресу.
    - `table export reports skipped questions` — `{ ok: true, skipped: 2 }` → текст `'Пропущено 2 запитання інших типів чи з медіа (вони є лише у файлі вікторини)'`; `skipped: 5` → «Пропущено 5 запитань…»; `0` — повідомлення немає.
    - `export error is an alert` — `{ ok: false, error: 'io_media_fetch' }` → `role="alert"` з `'Не вдалося прочитати картинки чи аудіо вікторини.'`.
    - `import dialog picks a file and goes on` — `getByRole('dialog', { name: 'Імпорт вікторини' })`; `userEvent.upload`/`fireEvent.change` на `input[type=file]` (`accept=".quiz,.xlsx,.csv"`) → `importQuizFile` з файлом; `{ ok: true, id: 'n1' }` → `onImported('n1')`.
    - `row errors are listed and nothing is opened` — 60 помилок → заголовок «У таблиці є помилки — нічого не створено:», 50 пунктів (`'Рядок 2: немає правильної відповіді'` першим), «…і ще 10»; `onImported` не викликано; новий файл можна вибрати знову.
    - `progress and the upload wait` — прогрес `wait` → «Забагато завантажень поспіль — чекаю хвилинку…»; поки йде імпорт, «Закрити» `disabled` і Escape не закриває.
    - `template button downloads` — «Завантажити шаблон» → `downloadTemplate()`.
    - `newer file message` — `{ ok: false, error: 'io_newer' }` → `role="alert"` з «Файл з новішої версії додатку…».
    - `Escape and close` — без роботи Escape і «Закрити» викликають `onClose`, фокус повертається на «Імпорт» (перевірити в `Quizzes.test.tsx`).
  - `Quizzes.test.tsx`: є «Імпорт» поряд з «Нова вікторина»; у кожній вікторині — «Експорт»; успішний імпорт переходить на `/quizzes/n1` (`MemoryRouter` + маршрут-заглушка).
  - `lazy.test.ts` (читання вихідників через `node:fs`, як `source-scan.test.ts`): `from 'fflate'` є лише в `quiz-io/quiz-file.ts` і `quiz-io/xlsx.ts`; жоден файл поза `quiz-io/` не імпортує статично `quiz-io/{actions,quiz-file,xlsx,table,table-words,transfer,media}`; `ExportMenu.tsx` і `ImportDialog.tsx` імпортують `./actions` лише через `import(` (статичний — лише `import type`).
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/quiz-io/ui.test.tsx apps/web/src/quiz-io/lazy.test.ts apps/web/src/pages/Quizzes.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** за «Де кнопки» (діалог — за зразком `result-image/ResultImage.tsx`: `role="dialog" aria-modal="true"`, Escape, пастка Tab; у `Quizzes.tsx` — стан `importOpen`, `onImported={(id) => navigate(\`/quizzes/${id}\`)}`; `ExportMenu` закриває `<details>` після вибору). Стилі — `.io-export` (меню під кнопкою, не ширше екрана, на 360 px — на всю ширину картки), `.io-dialog`, `.io-errors` (прокрутка ≤ 50vh); кольори — наявні змінні тем, світла й темна.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/quiz-io/ExportMenu.tsx apps/web/src/quiz-io/ImportDialog.tsx apps/web/src/quiz-io/ui.test.tsx apps/web/src/quiz-io/lazy.test.ts apps/web/src/pages/Quizzes.tsx apps/web/src/pages/Quizzes.test.tsx apps/web/src/styles.css
git commit -m "feat(web): 42 import export — Export (quiz file or Excel table) on each quiz and Import with the template, progress, the upload wait and the row report in My quizzes; the io modules load only on use"
```

---

### Задача 7. Довідка автора: «Імпорт і експорт» (`setting.importExport`)

**Files:**
- Modify: `apps/web/src/help/host-help.ts` (`'importExport'` в кінець `SETTING_HELP_KEYS`), `apps/web/src/help/help-uk.ts` (записи після `setting.groups.*`), `apps/web/src/help/__fixtures__/help-uk-golden.json` (запис `setting.importExport`), `apps/web/src/locales/{en,pl,de,es,it,ar}.help.json`
- Test: `apps/web/src/help/help-golden.test.ts`, `apps/web/src/help/host-help.test.ts` (наявні — мають пройти), `apps/web/src/quiz-io/ui.test.tsx` (ⓘ у діалозі)

**Тексти (uk):**
- `title`: «Імпорт і експорт»
- `what`: «Вікторину можна зберегти файлом і завантажити назад — у свій чи чужий акаунт. Простіші запитання зручно набирати в Excel чи Google Таблицях.»
- `how.0`: «„Експорт → Файл вікторини“ у «Моїх вікторинах» зберігає файл .quiz: усі раунди, запитання, картинки й аудіо. Відео YouTube лишаються посиланнями. Призи, історія ігор і вподобайки у файл не потрапляють.»
- `how.1`: «„Експорт → Таблиця (Excel)“ зберігає .xlsx з варіантами, так/ні, текстом і числом із класичних раундів. Решту запитань пропущено — вони є лише у файлі вікторини.»
- `how.2`: «„Імпорт“ приймає .quiz, .xlsx або .csv (UTF-8, кома чи крапка з комою) і завжди створює нову вікторину — наявну ніколи не перезаписує. Потім вона відкривається в редакторі.»
- `how.3`: «Таблицю спершу перевірено: якщо є помилки, побачиш список «Рядок 5: немає правильної відповіді» і нічого не створиться. Виправ і завантаж знову.»
- `points.0`: «Колонки: Раунд, Тип, Запитання, Правильна відповідь, Варіант 1–6, Бали, Таймер (с), Підказка. Порожні бали й таймер — типові {defaultPoints} і {defaultTime} с. Рядки з однаковим раундом ідуть в один класичний раунд.»
- `tip.0`: «Почни з „Завантажити шаблон“: там по прикладу кожного типу. У Google Таблицях — «Файл → Завантажити → xlsx».»
- `limits.0`: «Таблиця — до 500 рядків і до 200 запитань у вікторині; файл вікторини — до 100 МБ. Великий файл з картинками вантажиться кілька хвилин: сайт приймає до 20 файлів за хвилину.»

`{defaultTime}` уже є в `LIMIT_KEYS` (`help/help-vars.ts`); `'defaultPoints'` — додати в `LIMIT_KEYS` (не літерал).

- [ ] **Step 1: Write the failing test:** `ui.test.tsx` — у діалозі імпорту є кнопка ⓘ довідки; клік відкриває запис із заголовком «Імпорт і експорт». Golden-тест з новим ключем у `SETTING_HELP_KEYS` без записів — FAIL.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/quiz-io/ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement:** записи uk, golden (той самий текст після підстановки змінних, як інші записи), переклади в шести `*.help.json` (ті самі ключі й плейсхолдери).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/help apps/web/src/i18n.test.ts apps/web/src/quiz-io && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/help apps/web/src/locales apps/web/src/quiz-io/ui.test.tsx
git commit -m "docs(web): 42 import export — the author help entry on the quiz file, the table, the template and the limits, in seven languages"
```

---

### Задача 8. Наскрізні сценарії й кадри (`part42-import-export.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part42-import-export.e2e.ts`

Сценарії (`useE2eServer`; автор — `register(page, 'menu', …)` на телефоні 360×740, світла тема init-скриптом `quiz:theme`; вікторина створюється через `page.request.post(\`${base}/api/quizzes\`)`; медіа — `POST /api/uploads` з `avatarPng()` і `POST /api/uploads/audio` з `silentMp3()`; вміст — природа й українські річки, таймери 25–30 с; порівняння вікторин — `GET /api/quizzes/<id>` без `id`):

- `part 42: import export — a quiz file round trip with media, a table round trip for four types, the row report and the template, phone 360 px, light theme`:
  1. Вікторина «Річки й природа 42»: класичний раунд «Річки» з `single` без медіа, `single` (картинка запитання й картинка варіанта), `boolean` (`correct: false`), `text`, `numeric`, `single` з аудіо-файлом; другий раунд — бліц з двома `single`; `spares` з одним запитанням.
  2. «Мої вікторини» → «Експорт» → «Файл вікторини» → `waitForEvent('download')`, `suggestedFilename()` = `'Річки-й-природа-42.quiz'`; кадр `p42-export-menu` (меню відкрите), `expectNoSideScroll`.
  3. «Імпорт» → діалог (кадр `p42-import-dialog`, `expectNoSideScroll`) → `setInputFiles` скачаним файлом → перехід на `/quizzes/<новий id>` (редактор). `GET` нової вікторини: після заміни кожної адреси медіа на ту, що стоїть у старій вікторині на тому самому місці, вміст `toEqual` старому; усі нові адреси відповідають `/^\/uploads\/[a-z0-9]{16,64}\./` і **відрізняються** від старих; байти `GET /uploads/<нова>` = байтам старої; у списку тепер дві вікторини з тією самою назвою.
  4. «Експорт» → «Таблиця (Excel)» старої вікторини → завантаження `'Річки-й-природа-42.xlsx'`; повідомлення «Пропущено 4 запитання інших типів чи з медіа (вони є лише у файлі вікторини)» (`single` з картинками, `single` з аудіо й два запитання бліцу; запасні не рахуються).
  5. Імпорт цього `.xlsx` → редактор нової вікторини з назвою `'Річки-й-природа-42'`; `GET`: один класичний раунд «Річки» з чотирма запитаннями тих самих типів, текстів, відповідей, балів, таймерів.
  6. Звіт помилок: `setInputFiles({ name: 'pomylky.csv', mimeType: 'text/csv', buffer })` — CSV з `;` і BOM: заголовок uk, рядок без правильної відповіді, рядок «варіанти» з одним варіантом → у діалозі «У таблиці є помилки — нічого не створено:», «Рядок 2: немає правильної відповіді», «Рядок 3: потрібно щонайменше 2 варіанти»; кількість вікторин у `GET /api/quizzes` не змінилась; кадр `p42-row-report`, `expectNoSideScroll`.
  7. Шаблон: «Завантажити шаблон» → `'quiz-template.xlsx'`; імпорт цього файлу → нова вікторина з 4 запитаннями (`single`, `boolean` з `correct: false`, `text`, `numeric`), таймери ≥ 25.
  8. Невідомий файл `notes.txt` → «Виберіть файл .quiz, .xlsx або .csv.».
  9. Світла тема: клас, який ставить `applyThemeClass` (`apps/web/src/theme-mode.ts`), — світлий на всіх кадрах.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 42"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** меню експорту й діалог уміщаються в 360 px, кнопки не налазять, звіт помилок читається, світла тема.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part42-import-export.e2e.ts
git commit -m "test(e2e): part 42 — export a quiz file and import it as a new quiz with re-uploaded media, a table round trip for four types with the skipped count, the row report creating nothing, the template, phone 360 px, light theme"
```

---

## Розбіжності зі специфікацією (рішення плану)

1. **«Пояснення» → «Підказка».** У схемі немає поля пояснення; колонка в позиції «Пояснення» пишеться й читається як `hint` із заголовком «Підказка» («Пояснення» розпізнається як синонім). Варто знати: підказку гравці бачать **до** відповіді (баф «Підказка ведучого»), тож поясненням із відповіддю її не заповнювати — це сказано в шаблоні прикладом, що не видає відповідь.
2. **Пропущені запитання — не лише «інших типів».** Таблиця не несе медіа, відхилення числа, «Не перебільш» і `;` у написанні, а також раунди, крім класичного (при імпорті все стане класикою). Такі запитання теж пропускаються, і текст повідомлення — «…інших типів чи з медіа (вони є лише у файлі вікторини)».
3. **500 рядків проти 200 запитань.** Таблиця читає до 500 рядків, але схема дозволяє не більше 200 запитань у вікторині, 100 у раунді й 10 раундів — понад це звіт по рядках (`quiz_full`, `round_full`, `too_many_rounds`).
4. **Ліміт завантажень 20/хв.** Імпорт `.quiz` з багатьма медіа чекає й повторює (`too_many` → 15 с, до 8 разів на файл); великий файл імпортується кілька хвилин. Сервер не змінюється.
5. **Слова таблиці — окремий словник `quiz-io/table-words.ts`** (у `ALLOWED` source-scan), а не ключі i18n: імпорт має знати всі 7 мов одночасно. Решта текстів — звичайні ключі i18n.
6. **Експорт — лише зі списку «Мої вікторини»** (окремого меню вікторини в коді немає; у редакторі можуть бути незбережені зміни). Після будь-якого імпорту відкривається редактор нової вікторини.
