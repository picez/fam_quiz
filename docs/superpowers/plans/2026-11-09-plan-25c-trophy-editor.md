# План 25c: повноекранний редактор призу — кубок на весь екран, шухляда з шістьма інструментами, закриті за рівнем шрифти й наліпки

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** гравець у «Профіль → Мої призи» створює й змінює приз у новому повноекранному редакторі (варіант C): кубок на весь екран крутиться пальцем, знизу шухляда з інструментами **Форма · Фото · Написи · Ефекти · Поява · Приз**, кожна зміна одразу видна на кубку. Там же назва, справжній приз, титул, диплом і «Підпис під кубком і на дипломі». Старий `PrizeEditor` прибрано. Шрифти й наліпки закриті за рівнем, сервер це перевіряє. Замок грааля знято.

**Spec:** `docs/superpowers/specs/2026-11-08-trophy-editor-design.md`. Розділи: «Що вирішив власник» (усі пункти), «Цілі» 1 і 4, «Анти-цілі» (редактор незручний одним пальцем; старі призи змінили вигляд), «Обмеження», «Як це зроблено» (тимчасовий замок на граалі, `engraving`, шрифт «класичний», «Вхід»). Частина 25c. Плани 25a (`2026-11-08-plan-25a-trophy-render.md`) і 25b (`2026-11-09-plan-25b-trophy-effects.md`) уже зроблені: схема `decor`, рушій, ефекти й поява.

**Архітектура:**
- **shared** (`decor.ts`, `prizes.ts`): схема не змінюється. Додаються `EMPTY_DECOR` і `decorLocked(decor, level, stored)`. `PICKABLE_TROPHY_KINDS` та `isPickableTrophy` прибрано.
- **сервер** (`prizes.ts`, `prize-routes.ts`, `xp-store.ts`): перевірка рівня під час `POST`/`PUT` (`409 decor_locked`), без `trophy_unavailable`. Новий грааль без `decor` зберігається з `EMPTY_DECOR`, щоб ніколи не показати запечені сімейні фото.
- **веб, чисті модулі** (без React і `three`):
  - `prizes/studio-draft.ts` — чернетка редактора, дії й шлях чернетка → `PrizeContent`;
  - `prizes/crop.ts` — математика кадрування.
- **рушій** (`trophy/engine/*`):
  - спільні текстури за ключем з лічильником посилань і роздільність за розміром (GPU-пам'ять вітрини);
  - один буфер рендерера з `setViewport`/`setScissor`;
  - `TrophyHandle.update(look)`: оформлення перебудовується на місці, без значка-емодзі між кадрами, кут повороту лишається;
  - виправлені точки кріплення кубка, корони й зірки.
- **веб, UI** (`prizes/PrizeStudio.tsx` + `prizes/tools/*`, сторінка `pages/PrizeStudioPage.tsx`, маршрути `/profile/prizes/new` і `/profile/prizes/:id`): повноекранний шар у палітрі «Кривавого місяця».

**Технології:** TypeScript, zod, React 19 + react-router + Testing Library (jsdom), three.js `~0.183.2`, Fastify + Drizzle (PGlite у тестах), vitest, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`). `packages/engine` не змінюється. Якщо без підняття ніяк, зупинитися й спитати власника до пушу: це скидає живі ігри.
- `prizeContentSchema` і `trophyDecorSchema` лишаються `.strict()`, і полів у них 25c не додає. Кожен наявний рядок `prize.content`, `prize_award.content` і знімок кімнати (`placedPrizeSchema`) валідний без змін.
- Старі призи виглядають як раніше. Приз без `decor`, який лише перейменували чи змінили в «Приз», зберігається без `decor` (задача 3).
- Вручений грааль без `decor` у проді малюється з `apps/web/public/models/grail-family.glb` через тимчасову гілку `modelUrl` (`trophy/trophy-meta.ts`). **Файл і гілку не чіпати**: рішення за власником.
- Зарезервовані призи в редакторі лише переглядаються, без жодної кнопки збереження. Вручені, як і зараз, видно лише у вітрині. Логіка складу, резерву й вручення не змінюється. Ліміт складу — `PRIZE_LIMITS.perOwner` (50).
- Фото — через наявний `/api/uploads` (`uploadImage` з `api.ts`): до 2 МБ, jpeg/png/webp, 20/хв на акаунт. Адреси — `IMAGE_URL`. Відповідь 429 — це помилка `too_many`.
- Межі `decor` — з `DECOR_LIMITS`: кільце ≤ 16 фото, самоцвіти ≤ 8, решта місць — 1. Написів ≤ 4: рим ≤ 80 символів, поясок ≤ 40, табличка ≤ 40 (2 рядки), зворот ≤ 60. Наліпок ≤ 6, одна на місце. Редактор пропонує лише місця з `DECOR_SUPPORT[kind]`.
- Доступність:
  - кожна ціль дотику не менша за 44×44 CSS px;
  - фокус видно (`:focus-visible`), контраст тексту ≥ AA (4.5:1) на `--surface` і `--stage`;
  - вкладки шухляди — `role="tablist"`/`tab`/`tabpanel`, перемикаються стрілками;
  - RTL для `ar`: лише логічні властивості, фізичні позначено `/* phys */` (`styles-rtl.test.ts`);
  - `prefers-reduced-motion: reduce`: ефекти статичні, поява не грає, кнопка «Показати появу» вимкнена з поясненням. Анімації CSS — лише в `@media (prefers-reduced-motion: no-preference)`.
- Без WebGL на місці кубка значок-емодзі, як скрізь (`TrophyView`), а над шухлядою пояснення `studioNoWebgl`. Усі інструменти працюють і зберігають.
- Тема «Кривавий місяць» (23a):
  - лише змінні палітри з `:root` у `apps/web/src/styles.css` (`--stage`, `--surface`, `--paper`, `--dim`, `--accent`, `--accent-text`, `--line`, `--radius`, `--radius-small`);
  - без `backdrop-filter`;
  - лише радіуси з `theme.test.ts`.
- `three` імпортують лише файли `apps/web/src/trophy/engine/` (`lazy.test.ts`). Редактор і лобі не вантажать рушій статично. Лобі (`PrizePlaces`) і список «Мої призи» показують значок, як зараз.
- Нові рядки інтерфейсу:
  - uk — в `apps/web/src/i18n.ts`;
  - ключ — у новому `ADDED_25C` в `apps/web/src/i18n.test.ts` (і в умові `adds no uk keys beyond the agreed list`);
  - переклади — у всіх 6 json (`en`, `pl`, `de`, `es`, `it`, `ar`), разом з uk у тій самій задачі. `locales/checks.test.ts` («is complete») і `pnpm l10n check <lang>` чисті.

  Старі ключі `PrizeEditor` лишаються (golden), потрібні перевикористовуються. ru ніколи. Нічого, пов'язаного з росією. Кириличні літерали в `apps/web/src` лише в словниках і тестах (`source-scan.test.ts`).
- Сімейні фото з `D:\myfiles\cup1` ніколи не потрапляють у git, тести, e2e чи знімки. У e2e лише PNG, намальовані в сторінці.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Prettier не запускати. e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<частина>"` на передньому плані, кожен виклик до 10 хв (знімки з `E2E_SHOTS=1`).
- Гілка `plan-25c` з `main` (після злиття `plan-25b`), кожна задача — коміт.

## Відкладене з 25a і 25b

З журналів `.superpowers/sdd/2026-11-08-plan-25a-trophy-render/progress.md` і `.superpowers/sdd/2026-11-09-plan-25b-trophy-effects/progress.md` до 25c призначено:
- точки кріплення з задачі 5 плану 25a (задача 6 цього плану):
  - кільце кубка — прямий конус, що відстає від чаші внизу на ~0.04;
  - самоцвіти корони на 0° лягають на запечену кульку;
  - самоцвіти й бокові наліпки зірки тонуть у схилі променя;
  - допуск меж 0.08 у `anchors.test.ts` надто широкий;
- текстури оформлення займають ~4–5 МБ GPU на кожен вигляд, а кеш картинок ніколи не зменшується (вітрина 60 × 16 фото) — задача 4;
- буфер спільного рендерера перевиділяється кілька разів за кадр, коли поруч вигляди різного розміру (перегляд поверх вітрини) — задача 5;
- «редактор має показати код `decor_text_length`» — задача 3 (`studioIssues`).

Решта дрібниць з журналів лишається на потім.

## Review Focus

- Старий приз (без `decor`, зокрема медаль чи кубок з 14a) лише перейменували в новому редакторі. Очікуємо: збережений зміст без `decor`, на церемонії ні появи, ні ефекту, як раніше (задача 3, тест `an old prize renamed keeps no decor`; задача 8, тест `saving an old prize sends no decor`).
- Швидкі зміни підряд (набір напису, кілька дотиків по ефектах) — пізня збірка старшого вигляду приходить після новішої. Очікуємо: на кубку останній вибір, без мигтіння значка й без витоку текстур (задача 7, тести `the latest update wins` і `update keeps the frame and the pose`).
- Форму змінили з кубка з кільцем фото й римом на медаль, а потім назад. Очікуємо: поки редагуємо, фото й напис не губляться. У збережене потрапляє лише те, що форма має (задача 3, тест `kind switch keeps the draft and saves only supported places`).
- Вибрали більше фото, ніж влазить у місце, або 429 посеред пачки. Очікуємо: завантажено до межі, решта не надсилається, помилка видна, уже додані фото лишаються (задача 9, тести `a batch stops at the place limit` і `a failed upload keeps the photos already added`).
- Грааль без `decor` створено через API (старий клієнт, скрипт) чи `decor: null`. Очікуємо: збережено з `EMPTY_DECOR`, тож запечені сімейні фото ніде не з'являться (задача 2, тест `a new grail always has decor`).

## Рішення (там, де специфікація лишила місце будівельнику)

**Вхід і маршрути.**
- `/profile/prizes/new` — новий приз, `/profile/prizes/:id` — наявний. Обидва рендерять `PrizeStudioPage`. Сторінка вантажить `myPrizes()` і `useMyProfile()` (рівень `profile.level.progress.level`). Поки вантажиться — `t('loading')`. Невідомий `id` — `prizesEmpty`-подібне повідомлення `studioNotFound` і посилання назад.
- «Мої призи»: кнопка «Новий приз» → `navigate('/profile/prizes/new')`. На вільному призі «Змінити» → `/profile/prizes/<id>`. На зарезервованому замість «Змінити» кнопка «Переглянути» (`prizeViewOpen`) → той самий маршрут, де редактор показує приз лише для перегляду.
- Після збереження чи «Скасувати» — `navigate('/profile/prizes')`. «Скасувати» з незбереженими змінами спершу питає `window.confirm(t('studioLeaveConfirm'))`.

**Макет C** (`.prize-studio`, `position: fixed; inset: 0`, над меню):
- шапка `.studio-head` (висота 56 px): «Скасувати» · заголовок (`studioNewTitle` / `studioEditTitle` / `studioViewTitle`) · «Зберегти» (`btn-primary`);
- сцена `.studio-stage`: `TrophyView size="view" spin={false} interactive appear={false}` на весь вільний простір (не менше 40 % висоти вікна);
- шухляда `.studio-drawer`:
  - рядок шести вкладок (`role="tablist"`, кожна ≥ 44 px заввишки, підпис і значок);
  - панель (`role="tabpanel"`, `max-height: 45dvh`, власна прокрутка);
  - дотик по активній вкладці згортає й розгортає панель (`aria-expanded` на вкладці).

  Від `min-width: 900px` шухляда стає колонкою праворуч (`inline-end`) шириною 400 px на всю висоту.

  Початкова вкладка: «Форма» для нового призу, «Приз» для наявного.

**Що в якому інструменті:**

| Вкладка | Вміст |
|---|---|
| Форма | вид (6 + «Без трофея»), матеріал (4), **наліпки** (місця з `DECOR_SUPPORT[kind].sticker`, на кожне — сітка наліпок) |
| Фото | місце фото, додати (кілька файлів), порядок (кнопки «Раніше»/«Пізніше»), прибрати, кадрувати, рамка, стиль |
| Написи | для кожного місця з `DECOR_SUPPORT[kind].inscription`: перемикач, текст із лічильником, шрифт (класичний + 8), вигляд, колір |
| Ефекти | 6 ефектів; для сяйва — колір |
| Поява | 4 анімації і кнопка «Показати появу» |
| Приз | назва, підпис під кубком і на дипломі, справжній приз (перемикач, текст, фото), титул, диплом, примітка `prizeCeremonyNote` |

- Наліпки живуть у «Формі»: вони прикрашають саму форму, а вкладок за специфікацією рівно шість.
- «Без трофея»: `trophy: null`, сцена показує значок 🎁 і текст `studioNoTrophyHint`, вкладки Фото/Написи/Ефекти/Поява мають `aria-disabled="true"` і показують `studioNeedsTrophy`.
- «Підпис під кубком і на дипломі» і «Титул» — звичайні поля: порожнє означає `null`. «Справжній приз» — перемикач, бо має ще й фото (`ImageField`).

**Чернетка → зміст** (`studio-draft.ts`):
- Новий приз: `name ''`, `trophy { kind 'cup', material 'gold' }`, `decor = EMPTY_DECOR`, решта `null`/`false`.
- Чернетка завжди має `decor` (для старого призу — `EMPTY_DECOR`). `contentOf(draft, initial)`:
  - `trophy === null` → без трофея;
  - `decor = shownDecor(kind, draft.decor)` (місця, яких форма не має, у збережене не йдуть, але в чернетці лишаються);
  - якщо `decor` глибоко дорівнює `EMPTY_DECOR`: початковий приз мав `decor` → `decor: null` (прибрати). Не мав → ключа `decor` немає (сервер лишає як було, тобто без оформлення). Виняток — грааль: він завжди отримує `decor` (сервер теж це гарантує).
- Кольори за замовчуванням: напис `'#3a2a0e'`, сяйво `GLOW_DEFAULT` (`'#ffd36b'`). Новий напис: `font null`, `look 'engraved'`.
- Палітра швидких кольорів (`STUDIO_SWATCHES`, у написах і сяйві), поруч `<input type="color">`: `gold #ffd36b`, `white #ffffff`, `dark #3a2a0e`, `red #e02531`, `blue #4fc3f7`, `mint #3ddcc0`, `violet #9b8cff`, `orange #ff7a1a`.
- Кубок оновлюється не на кожен символ. Дію з текстового поля інструмент шле як `dispatch(action, true)` (`typing`), і тоді `PrizeStudio` віддає кубку `useSettled(look, 300)`. Будь-яка інша дія — `useSettled(look, 0)`, тобто одразу.

**Кадрування** (`crop.ts`):
- Пропорції рамки — `PHOTO_BOX[place]`: `ring` `{150, 204}` (`RING_TILE`), `medallion`/`gems` `{1, 1}`, `plaque` `{1024, 400}`, `backdrop` `{1024, 1024}`. Ті самі значення передають у `coverCrop` функції `draw*` з `decor-canvas.ts`.
- Діалог кадрування (`role="dialog"`, `aria-modal`): полотно 2D з фото в рамці через `coverCrop` і `drawImage`.
  - тяг пальцем зсуває кадр (`panCrop`);
  - повзунок «Масштаб» `1–4`, крок `0.05`;
  - стрілки зсувають на `0.02`;
  - кнопки «Скинути» (`{0.5, 0.5, 1}`) і «Готово»;
  - Escape закриває без змін.

**Рівень:**
- Шрифт `f` відкритий, коли `lookLevel('font', f) <= level`; `null` («класичний») відкритий завжди. Наліпка відкрита, коли `stickerOpen(id, level)`.
- Закрите видно з `disabled` і підписом `t('lookLocked', { level: t('levelFromLevel', { n }) })`, де `n` — `lookLevel('font', f)` чи `seriesLevel(series)`.
- Сервер: `decorLocked(decor, level, stored)` повертає `true`, коли є закритий шрифт чи наліпка, якої немає в `stored`. Тоді `409 { error: 'decor_locked' }`. Шрифт і наліпка зі збереженого `decor` цього призу лишаються чинними.
- Рівень на сервері — `accountLevel(db, userId)` (`synced` + `levelOf(xpTotals)`). Рахується лише коли в запиті є непорожній `decor`.

**Грааль:** `PICKABLE_TROPHY_KINDS`, `isPickableTrophy` і `trophy_unavailable` прибрано звідусіль. Сервер (`withDecor`): якщо після злиття `trophy.kind === 'grail'` і `decor` немає (відсутнє без збереженого чи `null`) → `decor = EMPTY_DECOR`.

**Рушій:**
- `TrophyHandle.update(look: TrophyLook): void` — нова модель і оформлення будуються поруч, а старі лишаються в сцені, доки нові не готові. Потім заміна за один кадр і `dispose` старих. Новіший виклик скасовує старший (лічильник поколінь), застарілий результат одразу звільняється. `yaw`/`pitch` лишаються. Стан появи не перезапускається: було `null` (без `decor`) → `'skipped'`, інакше як було. `data-decor`, `data-effect`, `data-appearance` оновлюються. Ефект і реквізит появи будуються заново під новий `framingSphere`.
- `TrophyView`: зміна лише `trophy` (`lookKey`) при живому `handle` → `handle.update(look)`. Зміна `size`, `spin`, `interactive`, `appear` чи `label` → перемонтування, як зараз.
- Текстури: `DecorTextures.canvas(key, width, height, draw)` повертає спільну `Texture` для того самого `key` (лічильник посилань), `release(texture)` звільняє одне посилання, а останнє викликає `dispose()`. Ключ містить усе, від чого залежить малюнок: місце, матеріал, `frame`, `photoStyle`, url і `crop` кожного фото та чи завантажилось воно, напис цілком, розмір полотна.
- Роздільність: `TEXTURE_SCALE = { stage: 1, view: 1, phone: 0.5, card: 0.5 }`. Полотно `round(w·s) × round(h·s)`, перед `draw` — `ctx.scale(s, s)`, тож `draw*` не змінюються.
- Кеш картинок: не більше `IMAGE_CACHE_MAX = 48` записів, витісняється найдавніше використана готова картинка.
- Буфер рендерера: на початку кадру `need = max(width), max(height)` серед видимих виглядів з розміром. `setSize(need)`, коли `need` відрізняється від поточного. Кожен вигляд малюється з `setViewport(0, 0, w, h)`, `setScissor(0, 0, w, h)`, `setScissorTest(true)`. Копія — `drawImage(src, 0, bufferH − h·dpr, w·dpr, h·dpr, 0, 0, w·dpr, h·dpr)`, бо WebGL рахує від низу.

**Точки кріплення (задача 6):**
- кубок: кільце `y 0.83`, `height 0.22`, `radiusBottom 0.258`, `radiusTop 0.333`, обідки `{ y: 0.94, radius: 0.333 }` і `{ y: 0.72, radius: 0.258 }`;
- корона: самоцвіти на `y 0.37` (вище запечених кульок `y 0.28 ± 0.03`);
- зірка: самоцвіти й бокові наліпки на висоті грані плюс `0.004`, числа підбирає виконавець, тести нижче.

**uk-рядки** (точний текст; e2e шукає за ним):

| Ключ | uk |
|---|---|
| `studioNewTitle` | Новий приз |
| `studioEditTitle` | Зміна призу |
| `studioViewTitle` | Перегляд призу |
| `studioNotFound` | Такого призу немає на складі. |
| `studioToolsLabel` | Інструменти |
| `studioToolShape` / `studioToolPhotos` / `studioToolTexts` / `studioToolEffects` / `studioToolAppear` / `studioToolPrize` | Форма / Фото / Написи / Ефекти / Поява / Приз |
| `studioRotateHint` | Тягни кубок пальцем, щоб повернути |
| `studioNoWebgl` | Цей пристрій не показує 3D. Приз збережеться з усім оформленням, а кубок побачать ті, у кого 3D працює. |
| `studioReadOnly` | Приз лежить у грі — його можна лише переглянути. |
| `studioLeaveConfirm` | Вийти без збереження? |
| `studioNoTrophy` | Без трофея |
| `studioNoTrophyHint` | Приз без 3D-трофея. |
| `studioNeedsTrophy` | Спершу обери форму трофея. |
| `studioStickers` | Наліпки |
| `studioStickerNone` | Без наліпки |
| `studioPlace_front` … `studioPlace_base_right` | Спереду / Ззаду / Ліворуч / Праворуч / Основа ліворуч / Основа праворуч |
| `studioPhotoPlace` | Де фото |
| `studioPhotoPlace_ring` / `_medallion` / `_gems` / `_plaque` / `_backdrop` | Кільце по чаші / Медальйон спереду / Самоцвіти / На табличці / Фон за кубком |
| `studioPhotoAdd` | Додати фото |
| `studioPhotoCount` | {n} з {max} |
| `studioPhotoN` | Фото {n} |
| `studioPhotoEarlier` / `studioPhotoLater` / `studioPhotoRemove` / `studioPhotoCrop` | Раніше / Пізніше / Прибрати / Кадрувати |
| `studioPhotoFull` | Більше фото сюди не влізе. |
| `studioBackdropHint` | Фон видно на сцені й у повному перегляді. |
| `studioFrame` | Рамка |
| `studioFrame_none` / `_gold` / `_round` / `_rounded` | Без рамки / Золота / Кругла / Заокруглена |
| `studioPhotoStyle` | Стиль |
| `studioPhotoStyle_normal` / `_bw` / `_sepia` | Звичайне / Чорно-біле / Сепія |
| `studioCropTitle` / `studioCropZoom` / `studioCropReset` / `studioCropDone` | Кадрування / Масштаб / Скинути / Готово |
| `studioCropHint` | Тягни фото, щоб зсунути кадр |
| `studioText_rim` / `_band` / `_plaque` / `_back` | По колу на вінці / Поясок / Табличка / Зворот |
| `studioTextField` | Текст |
| `studioTextCount` | {n}/{max} |
| `studioFont` / `studioFontClassic` | Шрифт / Класичний |
| `studioLook` | Вигляд |
| `studioLook_engraved` / `_embossed` / `_colored` | Гравійований / Рельєфний / Кольоровий |
| `studioColor` | Колір |
| `studioColorCustom` | Свій колір |
| `swatch_gold` … `swatch_orange` | Золотий / Білий / Темний / Червоний / Блакитний / М'ятний / Фіолетовий / Помаранчевий |
| `studioPlaqueTaken` | Табличку зайняло фото. |
| `studioEffect_glow` / `_sparks` / `_rays` / `_fire` / `_snow` / `_none` | Сяйво / Іскри / Промені / Вогонь / Сніжинки / Без ефекту |
| `studioGlowColor` | Колір сяйва |
| `studioAppear_spin` / `_rise` / `_drop` / `_flash` | Обертання / Підйом з постаменту / Падіння з неба / Спалах |
| `studioAppearPlay` | Показати появу |
| `studioCalmNote` | Увімкнено «менше руху»: ефекти стоять, поява не грає. |
| `studioEngraving` | Підпис під кубком і на дипломі |
| `prizeViewOpen` | Переглянути |
| `err_decor_locked` | Цей шрифт чи наліпка ще закриті: вони відкриються з вищим рівнем. |
| `err_decor_text_length` | Напис задовгий для свого місця. |
| `err_decor_too_many_photos` | Забагато фото для цього місця. |
| `err_decor_plaque_twice` | На табличці або фото, або напис. |

Перевикористовуються:
- з `PrizeEditor` і спільні: `prizeName`, `prizeNameHint`, `prizeOptReal`, `prizeRealText`, `prizeOptTitle`, `prizeTitleText`, `prizeOptDiploma`, `prizeKind`, `prizeMaterial`, `prizeCeremonyNote`, `prizeNameRequired`, `err_prize_empty`, `save`, `cancel`, `trophy_*`, `material_*`, `font_*`;
- з профілю: `lookLocked`, `levelFromLevel`.

---

### Задача 1. shared: зняти замок грааля, `EMPTY_DECOR`, `decorLocked`

**Files:**
- Modify: `packages/shared/src/decor.ts`, `packages/shared/src/prizes.ts:10-15` (прибрати `PICKABLE_TROPHY_KINDS`, `isPickableTrophy` і коментар про замок)
- Test: `packages/shared/src/decor.test.ts`, `packages/shared/src/prizes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const EMPTY_DECOR: TrophyDecor; // { photos: [], photoPlace: 'ring', frame: 'none', photoStyle: 'normal', inscriptions: [], effect: { kind: 'none' }, appearance: 'spin', stickers: [] }
  export function isEmptyDecor(decor: TrophyDecor): boolean; // глибока рівність з EMPTY_DECOR (effect.color теж відсутній)
  /** true — є шрифт чи наліпка, закриті для level, і їх немає в stored. */
  export function decorLocked(decor: TrophyDecor, level: number, stored: TrophyDecor | null | undefined): boolean;
  ```
  `decor.ts` бере `lookLevel` і `stickerOpen` з `levels.ts` (цикл неможливий: `levels.ts` не імпортує `decor.ts`).

- [ ] **Step 1: Тести**
  - `decor.test.ts`:
    - `empty decor is valid and empty`: `trophyDecorSchema.parse(EMPTY_DECOR)` дорівнює `EMPTY_DECOR`; `isEmptyDecor(EMPTY_DECOR)`; `isEmptyDecor({ ...EMPTY_DECOR, effect: { kind: 'none', color: '#ffffff' } })` → `false`; `isEmptyDecor({ ...EMPTY_DECOR, appearance: 'drop' })` → `false`.
    - `level locks fonts and stickers`:
      - напис `font 'mono'` (рівень 3): `decorLocked(d, 2, null)` → `true`, `decorLocked(d, 3, null)` → `false`;
      - `font 'hand'` і `font null` → `false` на рівні 1;
      - наліпка першої `STICKERS` серії `'other'`: рівень 8 → `true`, 9 → `false`;
      - наліпка серії `'nya'` → `false` на рівні 1.
    - `stored decor stays valid`: `decor` з `font 'heavy'` і наліпкою `'other'`, `stored` з тим самим шрифтом (інше місце) і тією самою наліпкою (інше місце) → `decorLocked(d, 1, stored)` → `false`; без `stored` → `true`.
  - `prizes.test.ts`: тест про `PICKABLE_TROPHY_KINDS` замінити на `grail is a regular kind`: `prizeContentSchema` приймає `trophy { kind: 'grail', material: 'gold', decor: EMPTY_DECOR }`, а `'PICKABLE_TROPHY_KINDS' in shared` → `false` (імпорт `* as shared` з `./index`).
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/decor.test.ts packages/shared/src/prizes.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** у `decor.ts` і `prizes.ts`. Поки не змінено задачу 2, `apps/server` не збирається: `tsc` перевіряється лише для `packages/shared`.
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2 і `pnpm vitest run --maxWorkers=2 packages/shared`; `pnpm --filter @quiz/shared exec tsc --noEmit`.
  Expected: PASS, tsc чисто.
- [ ] **Step 5: Commit** `feat(shared): 25c EMPTY_DECOR and decorLocked; the grail is a regular trophy kind again`

---

### Задача 2. Сервер: перевірка рівня, грааль без замка й ніколи без `decor`

**Files:**
- Modify: `apps/server/src/xp-store.ts` (експорт `accountLevel`), `apps/server/src/prizes.ts:53-102` (`withDecor`, `createPrize`, `updatePrize`), `apps/server/src/prize-routes.ts:35-54`
- Test: `apps/server/src/prize-routes.test.ts` (тести `trophy_unavailable` на рядках ~80–140 переписати), `apps/server/src/prizes.test.ts`, `apps/server/src/xp-store.test.ts`

**Interfaces:**
- Consumes: `EMPTY_DECOR`, `decorLocked` (задача 1).
- Produces:
  ```ts
  // xp-store.ts
  export async function accountLevel(db: Db, userId: string): Promise<number>; // synced + levelOf(xpTotals)
  // prizes.ts
  export async function createPrize(db: Db, ownerId: string, content: PrizeContent, level?: number | null): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'too_many_prizes' | 'decor_locked' }>;
  export async function updatePrize(db: Db, ownerId: string, id: string, content: PrizeContent, level?: number | null): Promise<{ ok: true; prize: PrizeItem } | { ok: false; error: 'not_found' | 'prize_in_game' | 'decor_locked' }>;
  ```
  - `level` `undefined`/`null` — без перевірки (адмінські скрипти, `seed-prize.ts`, не змінюється).
  - Перевірка йде після `withDecor`: для `update` `stored = row.content.trophy?.decor`, для `create` — `null`.
  - Маршрути: `level = content.trophy?.decor ? await accountLevel(db, user.id) : null`. `decor_locked` → 409.
  - `withDecor`: грааль без `decor` після злиття → `EMPTY_DECOR`.
  - `trophy_unavailable` зникає з коду й тестів.

- [ ] **Step 1: Тести**
  - `prize-routes.test.ts`:
    - `the grail can be made and chosen`: `POST` з `trophy { kind:'grail', material:'gold' }` → 201, і `content.trophy.decor` дорівнює `EMPTY_DECOR`. `PUT` кубка на грааль → 200.
    - `a new grail always has decor`: `POST` грааля з `decor: null` → 201 з `EMPTY_DECOR`. `PUT` грааля з `decor: null` → `EMPTY_DECOR`. `PUT` без ключа `decor` після збереженого `decor` з написом → напис лишився.
    - `a locked font or sticker is refused`: новий акаунт (рівень 1):
      - `POST` з написом `font 'mono'` → 409 `{ error: 'decor_locked' }`;
      - з `font 'hand'` → 201;
      - з наліпкою серії `'nyaa'` → 409.
    - `level unlocks`: акаунту нараховано XP на рівень 3 (`xpForLevel(3)`, рядки `xp_entry` як у `xp-store.test.ts`) → `POST` з `font 'mono'` → 201.
    - `a stored font stays valid`: приз, вставлений напряму через `createPrize(db, id, content)` (без `level`) з `font 'heavy'` → `PUT` того самого змісту з новою назвою → 200. `PUT` з `font 'heavy'` на іншому місці теж 200. `PUT`, що додає `font 'pixel'` → 409.
    - `an old client keeps decor`: приз з `font 'heavy'` (вставлений через `createPrize` без `level`) → `PUT` без ключа `decor` на рівні 1 → 200, `decor` лишився.
  - `prizes.test.ts`: `createPrize(..., level 1)` з `font 'brush'` → `{ ok:false, error:'decor_locked' }`; без `level` → ok.
  - `xp-store.test.ts`: `accountLevel` дорівнює `publicLevel(...).level` для акаунта з XP `xpForLevel(5) + 1` → 5.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/server/src/prize-routes.test.ts apps/server/src/prizes.test.ts apps/server/src/xp-store.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** зміни в трьох файлах. Прибрати `isPickableTrophy` з імпортів.
- [ ] **Step 4: Тести й типи**
  Run: команда зі Step 2, `pnpm vitest run --maxWorkers=2 apps/server` і `pnpm --filter @quiz/server exec tsc --noEmit`.
  Expected: PASS, tsc чисто. `apps/web` ще імпортує `isPickableTrophy` (`PrizeEditor.tsx`), його прибирає задача 8. До того `tsc` вебу падає лише на цьому імпорті.
- [ ] **Step 5: Commit** `feat(server): 25c prize writes check fonts and stickers against the level (decor_locked); the grail is open and never stored without decor`

---

### Задача 3. Веб, чисті модулі: чернетка редактора й кадрування

**Files:**
- Create: `apps/web/src/prizes/studio-draft.ts`, `apps/web/src/prizes/studio-draft.test.ts`, `apps/web/src/prizes/crop.ts`, `apps/web/src/prizes/crop.test.ts`
- Modify: `apps/web/src/trophy/decor-layout.ts` (експорт `PHOTO_BOX`), `apps/web/src/trophy/decor-canvas.ts` і `apps/web/src/trophy/engine/decor-meshes.ts` (розміри рамок беруться з `PHOTO_BOX`, числа не змінюються)
- Test: `apps/web/src/trophy/decor-canvas.test.ts`, `apps/web/src/trophy/lazy.test.ts` (+ `prizes/studio-draft.ts`, `prizes/crop.ts` у списку без `three`)

**Interfaces:**
- Consumes: `EMPTY_DECOR`, `isEmptyDecor`, `shownDecor`, `trophyDecorSchema`, `prizeContentSchema`, `DECOR_LIMITS`, `DECOR_SUPPORT` (shared); `coverCrop`, `RING_TILE` (`decor-layout.ts`).
- Produces:
  ```ts
  // studio-draft.ts
  export interface StudioDraft {
    name: string;
    trophy: { kind: TrophyKind; material: TrophyMaterial } | null;
    decor: TrophyDecor;            // завжди є; місця, яких форма не має, теж лишаються
    engraving: string;             // '' → null
    real: { text: string; photoUrl: string | null } | null;
    title: string;                 // '' → null
    diploma: boolean;
  }
  export const STUDIO_SWATCHES: readonly { id: 'gold' | 'white' | 'dark' | 'red' | 'blue' | 'mint' | 'violet' | 'orange'; hex: string }[];
  export const INSCRIPTION_COLOR = '#3a2a0e';
  export function draftFrom(initial: PrizeContent | null): StudioDraft;
  export function contentOf(draft: StudioDraft, initial: PrizeContent | null): PrizeContent; // правила з «Рішень → Чернетка → зміст»
  export function studioLook(draft: StudioDraft): TrophyLook | null; // для TrophyView: { kind, material, decor: draft.decor }
  export type StudioAction =
    | { type: 'name' | 'engraving' | 'title'; value: string }
    | { type: 'trophy'; kind: TrophyKind | null } | { type: 'material'; material: TrophyMaterial }
    | { type: 'real'; value: StudioDraft['real'] } | { type: 'diploma'; value: boolean }
    | { type: 'photoPlace'; place: TrophyPhotoPlace } | { type: 'addPhotos'; urls: string[] }
    | { type: 'movePhoto'; from: number; to: number } | { type: 'removePhoto'; index: number }
    | { type: 'crop'; index: number; crop: DecorPhoto['crop'] }
    | { type: 'frame'; frame: TrophyPhotoFrame } | { type: 'photoStyle'; style: TrophyPhotoStyle }
    | { type: 'inscription'; place: InscriptionPlace; value: Inscription | null } // null — прибрати
    | { type: 'sticker'; place: StickerPlace; id: string | null }
    | { type: 'effect'; kind: TrophyEffect; color?: string } | { type: 'appearance'; appearance: TrophyAppearance };
  export function studioReducer(draft: StudioDraft, action: StudioAction): StudioDraft;
  export function photoLimit(place: TrophyPhotoPlace): number; // ring 16, gems 8, інші 1
  export type StudioIssue = 'prize_empty' | 'name' | 'decor_text_length' | 'decor_too_many_photos' | 'decor_plaque_twice' | 'fill';
  export function studioIssues(content: PrizeContent): StudioIssue[]; // [] — можна зберігати; UI (задача 8) бере текст: prize_empty → err_prize_empty, name → prizeNameRequired, decor_* → err_decor_*, fill → prizeFillOptions
  // crop.ts
  export const PHOTO_BOX: Record<TrophyPhotoPlace, { width: number; height: number }>; // реекспорт з decor-layout
  export function panCrop(crop: DecorPhoto['crop'], image: { width: number; height: number }, box: { width: number; height: number }, dxPx: number, dyPx: number, viewWidth: number): DecorPhoto['crop'];
  export function zoomCrop(crop: DecorPhoto['crop'], scale: number): DecorPhoto['crop']; // scale обрізано до [1, 4]
  export const CROP_RESET: DecorPhoto['crop']; // { x: 0.5, y: 0.5, scale: 1 }
  ```
  Правила редьюсера:
  - `trophy` з `null` на вид повертає матеріал і `decor` чернетки;
  - `addPhotos` додає до `photoLimit(place) − photos.length` адрес, кожна з `CROP_RESET`;
  - `photoPlace` з меншою межею обрізає фото до межі;
  - `effect` без кольору для `glow` ставить `GLOW_DEFAULT`, для інших прибирає `color`;
  - `inscription` для місця, якого ще немає, додає його, а наявне замінює;
  - порядок `inscriptions` і `stickers` — за `INSCRIPTION_PLACES` і `STICKER_PLACES`, тож `decorSummary` стабільний.

  `studioIssues` повертає за порядком:
  1. `trophy === null && engraving/real/title порожні && !diploma` → `'prize_empty'`;
  2. назва порожня → `'name'`;
  3. повідомлення `zod` з `prizeContentSchema.safeParse`: `decor_text_length`, `decor_too_many_photos`, `decor_plaque_twice` → той самий код, решта → `'fill'`.

  `panCrop`: зсув на `dxPx` пікселів полотна шириною `viewWidth` пересуває центр на `−dxPx · (sw / viewWidth) / image.width` (`sw` з `coverCrop`), так само по `y`. Центр обрізано до діапазону, у якому кадр не виходить за фото, тобто `[sw / 2 / image.width, 1 − sw / 2 / image.width]`, а якщо кадр ширший за фото — 0.5.

- [ ] **Step 1: Тести**
  - `studio-draft.test.ts`:
    - `a new draft`: `draftFrom(null)` → `trophy { cup, gold }`, `decor` дорівнює `EMPTY_DECOR`, `name ''`. `contentOf(draftFrom(null), null)` з назвою `'Кубок'` проходить `prizeContentSchema`, а `trophy` не має ключа `decor`.
    - `an old prize renamed keeps no decor`: `initial` = кубок `silver` без `decor`, з `engraving 'Браво'` → чернетка з новою назвою → `contentOf` дорівнює `{ ...initial, name: 'Нова' }`, без ключа `decor` у `trophy`.
    - `emptied decor is removed`: `initial` з `decor` (1 напис) → прибрати напис і поставити `appearance` назад на `'spin'` → `contentOf(...).trophy.decor === null`.
    - `the grail always carries decor`: `trophy` `grail` з порожнім `decor` → `contentOf(...).trophy.decor` дорівнює `EMPTY_DECOR`.
    - `kind switch keeps the draft and saves only supported places`: кубок з 3 фото `ring` і `rim` → `trophy medal`. Чернетка ще має 3 фото й `rim`, `contentOf` → `photos []`, без `rim`. Назад `cup` → `contentOf` знову з 3 фото й `rim`.
    - `photo limits`: `addPhotos` 20 адрес на `ring` → 16; `photoPlace 'medallion'` → 1 фото (перше); `movePhoto {from:2,to:0}` переставляє; `removePhoto` прибирає; `crop` змінює лише свій індекс.
    - `inscriptions and stickers stay in place order`: додати `plaque`, потім `rim` → порядок `['rim', 'plaque']`; `sticker front` → `null` прибирає.
    - `glow colour`: `effect {kind:'glow'}` → `color '#ffd36b'`; `{kind:'fire', color:'#000000'}` → без `color`.
    - `issues`:
      - порожня назва → `['name']`;
      - `trophy null` і нічого більше → перший `'prize_empty'`;
      - рим 81 символ → `['decor_text_length']`;
      - `photoPlace 'plaque'` з фото й напис `plaque` → `['decor_plaque_twice']`;
      - готовий приз → `[]`.
  - `crop.test.ts`:
    - `pan moves the frame opposite the finger`: фото 1000×1000, рамка 1×1, `scale 2`, `viewWidth 200`, `dxPx 100` → `x` зменшився на 0.25 (`sw = 500`).
    - `pan stays inside the photo`: великий зсув → `x === 0.25` (половина кадру при `scale 2`). При `scale 1` на квадратному фото `x` лишається 0.5.
    - `zoom clamps`: `zoomCrop(c, 5).scale === 4`, `zoomCrop(c, 0.5).scale === 1`.
    - `boxes are the trophy ones`: `PHOTO_BOX.ring` дорівнює `{ width: RING_TILE.width, height: RING_TILE.height }`, `PHOTO_BOX.plaque` дорівнює `{1024, 400}`.
  - `decor-canvas.test.ts`: `the crop preview box is what the trophy draws`. Фальшивий `ctx.drawImage` фіксує `sx, sy, sw, sh` у `drawPhotoCard` для `PHOTO_BOX.plaque` і в `drawPhotoDisc`. Значення дорівнюють `coverCrop(image, PHOTO_BOX[place], crop)`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes/studio-draft.test.ts apps/web/src/prizes/crop.test.ts apps/web/src/trophy/decor-canvas.test.ts apps/web/src/trophy/lazy.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** обидва модулі й перенести розміри рамок у `PHOTO_BOX` (`decor-meshes.ts` бере `PLAQUE`/`BACKDROP` звідти).
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2 і `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25c studio draft model, prize issues incl. decor codes, crop math on the trophy's own frame boxes`

---

### Задача 4. Рушій: спільні текстури за ключем, роздільність за розміром, межа кешу картинок

**Files:**
- Modify: `apps/web/src/trophy/engine/textures.ts`, `apps/web/src/trophy/engine/decor-meshes.ts`, `apps/web/src/trophy/engine/trophy-engine.ts:74-94` (`decorResources`/`disposeDecor`)
- Test: `apps/web/src/trophy/engine/textures.test.ts`, `apps/web/src/trophy/engine/decor-meshes.test.ts`, `apps/web/src/trophy/engine/trophy-engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // textures.ts
  export interface DecorTextures {
    image(url: string): Promise<Img | null>;
    /** Та сама key → та сама Texture; кожен виклик — +1 посилання. */
    canvas(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture;
    /** −1 посилання; останнє — texture.dispose(). Невідома текстура (не з canvas) — dispose одразу. */
    release(texture: Texture): void;
    sticker(id: string): Promise<Texture | null>;
  }
  export const IMAGE_CACHE_MAX = 48;
  // decor-meshes.ts
  export const TEXTURE_SCALE: Record<TrophySize, number>; // { stage: 1, view: 1, phone: 0.5, card: 0.5 }
  export function buildDecor(kind, material, decor, size, textures): Promise<{ group: Group; backdrop: Texture | null; textures: Texture[] }>; // textures — усі взяті через canvas
  ```
  - Ключ полотна: `JSON.stringify([part, kind, material, frame, photoStyle, partData, loadedFlags, width, height])`, де `partData` — фото (url+crop) чи напис цілком, `loadedFlags` — чи завантажилась кожна картинка.
  - Ширина й висота множаться на `TEXTURE_SCALE[size]` (`Math.round`), перед `draw` — `ctx.scale(s, s)`.
  - `disposeDecor` звільняє геометрії й матеріали через `dispose`, а текстури з `built.textures` — через `release`. Текстури матеріалів у `decorResources` більше не збираються.

- [ ] **Step 1: Тести**
  - `textures.test.ts`:
    - `same key, same texture`: два `canvas('k', 4, 4, draw)` → та сама `Texture`, `draw` викликано раз. Один `release` → `dispose` не викликано, другий → викликано. Після цього `canvas('k', …)` малює знову.
    - `image cache is bounded`: 50 різних `image(url)` (фальшивий `Image`, що одразу `onload`) → у кеші ≤ 48. Перший url, який після того не просили, вантажиться знову (новий `Image`).
  - `decor-meshes.test.ts`:
    - `card textures are half size`: `buildDecor('cup', 'gold', decor з 3 фото ring, 'card', textures)` → полотно атласу `ringAtlasSize(3)` × 0.5 (з фальшивих `canvas` — аргументи `width`/`height`). Для `'view'` — повний розмір.
    - `same decor shares textures`: два `buildDecor` того самого `decor` і розміру з реальним кешем (`domTextures` з підміненим `document.createElement('canvas')`) → ті самі об'єкти `Texture` у `built.textures`.
    - `a changed inscription redraws only itself`: `decor` з кільцем фото й римом → змінити текст рима → атлас кільця той самий, текстура рима нова.
  - `trophy-engine.test.ts`: `dispose releases shared textures`: шпигун `release` на `textures` викликано для кожної з `built.textures`, а `dispose` спільних — ні, поки інший вигляд їх тримає.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine`
  Expected: FAIL на нових.
- [ ] **Step 3: Реалізувати** в `textures.ts` (кеш `Map<key, { texture, refs }>` і зворотна `WeakMap<Texture, key>`), `decor-meshes.ts`, `trophy-engine.ts`.
- [ ] **Step 4: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`. Expected: PASS.
- [ ] **Step 5: Commit** `perf(web): 25c decor textures shared by key with reference counts, half resolution on cards and phones, bounded image cache`

---

### Задача 5. Stage: один буфер на кадр, `setViewport`/`setScissor`

**Files:**
- Modify: `apps/web/src/trophy/engine/stage.ts:142-187`
- Test: `apps/web/src/trophy/engine/stage.test.ts` (фальшивий рендерер отримує `setViewport`, `setScissor`, `setScissorTest`)

**Interfaces:**
- Produces: поведінка з «Рішень → Рушій → Буфер рендерера». Публічний API `Stage` не змінюється.

- [ ] **Step 1: Тести**
  - `mixed sizes allocate once`: видимі вигляди 800×600 і 200×150, обидва `needsFrame` → за кадр `setSize` викликано раз (`800, 600`). Ще кадр — жодного.
  - `each view renders into its own corner`: для вигляду 200×150 при `dpr 2` → `setViewport(0, 0, 200, 150)`, `setScissor(0, 0, 200, 150)`, `setScissorTest(true)`. `drawImage` з аргументами `(dom, 0, 1200 − 300, 400, 300, 0, 0, 400, 300)`, бо буфер має висоту 600·2.
  - `the buffer follows the largest visible view`: великий вигляд пішов з екрана (`IntersectionObserver` → `isIntersecting false`) → наступний кадр `setSize(200, 150)`.
  - Наявні тести `stage.test.ts` (зокрема `clipping planes are per view`, `a zero-size moving view does not keep the loop`) проходять, якщо треба — з оновленими очікуваннями `drawImage`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/stage.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** у `frame`/`draw`.
- [ ] **Step 4: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`. Expected: PASS.
- [ ] **Step 5: Commit** `perf(web): 25c one renderer buffer per frame sized to the largest visible view; views draw through viewport and scissor`

---

### Задача 6. Точки кріплення кубка, корони й зірки

**Files:**
- Modify: `apps/web/src/trophy/anchors.ts` (кубок: `ring`; корона: `gems`; зірка: `gems`, `stickers.left`, `stickers.right`; коментар `cup.stickers` про 50° → 40°)
- Test: `apps/web/src/trophy/anchors.test.ts`

**Interfaces:**
- Produces: оновлені числа `TROPHY_ANCHORS` (типи без змін). Профілі в тесті переписано з `apps/web/scripts/build-trophies.mjs` (`cup()`, `crown()`, `star()`), з посиланням на рядки в коментарі.

- [ ] **Step 1: Тести**
  - `cup ring hugs the bowl`: зовнішній профіль чаші (`[0.22,0.66],[0.3,0.8],[0.33,0.95]`, лінійно між точками). На 9 рівних висотах у `[ring.y − h/2, ring.y + h/2]` радіус конуса `r(y)` задовольняє `body(y) − 0.005 ≤ r(y) ≤ body(y) + 0.02`. Обидва обідки на кінцях стрічки (`|torus.y − край| ≤ 0.001`).
  - `crown gems clear the baked stones`: для `n = 1..8` кожна точка `gemSpots(crown.gems, n)` віддалена від кожної кульки `(0.35·cos(2πi/5), 0.28, 0.35·sin(2πi/5))` (r 0.03) і від верхніх `(0.325·cos, 0.69, 0.325·sin)` (r 0.035) щонайменше на `r + gems.size/2 + 0.005`. Медальйон і наліпка `front` теж (з `size/2`).
  - `star decor sits on the face`: функція тесту `starFaceZ(x, y)` — висота передньої грані `starShape(0.4, 0.17, 0.12, 0.04)` на `[0, 0.62, 0]` (площина трикутника центр–обід–обід, що містить точку). Для кожного самоцвіта (`n = 1..8`) і наліпок `left`/`right`: `face − 0.002 ≤ z ≤ face + 0.02`.
  - `normals are unit and spots sit on the model`: допуск меж `0.08` → `0.03`.
  - `grail anchors are the baked ones` без змін.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/anchors.test.ts`
  Expected: FAIL на кубку, короні й зірці.
- [ ] **Step 3: Виправити числа** (кубок і корона — з «Рішень», зірка — під тест: самоцвіти через `center.z` і `radius`, наліпки через `position.z`/`normal`).
- [ ] **Step 4: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`. Expected: PASS. `decor-meshes.test.ts` не прив'язаний до старих чисел. Якщо прив'язаний — оновити очікування з `TROPHY_ANCHORS`, а не літералами.
- [ ] **Step 5: Commit** `fix(web): 25c cup ring follows the bowl, crown gems clear the baked stones, star gems and side stickers sit on the face`

---

### Задача 7. Рушій і `TrophyView`: `update(look)` на місці без значка й зі збереженим поворотом

**Files:**
- Modify: `apps/web/src/trophy/engine-types.ts`, `apps/web/src/trophy/engine/trophy-engine.ts`, `apps/web/src/trophy/TrophyView.tsx`
- Test: `apps/web/src/trophy/engine/trophy-engine.test.ts`, `apps/web/src/trophy/TrophyView.test.tsx` (фальшиві `handle` в інших тестах отримують `update: vi.fn()`, якщо цього вимагає `tsc`)

**Interfaces:**
- Consumes: `buildDecor` з `textures` (задача 4).
- Produces:
  ```ts
  export interface TrophyHandle { dispose(): void; replayAppearance(): void; /** перебудувати оформлення на місці; старе видно, доки нове не готове */ update(look: TrophyLook): void }
  ```
  Поведінка — з «Рішень → Рушій». Збій нової збірки (модель) → `onError`, як при `mount`. Збій лише `decor` → кубок без оформлення, як у 25a.
  `spec` (поточне `decor`) у замиканні `mount` стає змінним: `replayAppearance()` після `update` грає появу нового `look`. Якщо нова збірка ще не в сцені, поява почнеться з `t = 0` на першому кадрі після заміни.

- [ ] **Step 1: Тести**
  - `trophy-engine.test.ts` (моки як у 25b):
    - `update keeps the frame and the pose`: після `ready` повернути `yaw` (`pointerdown`/`pointermove` на 100 px). `update(new look)` → доки `loadModel` не розв'язано, у `scene` стара група, `onReady` вдруге не викликано, `onError` не викликано. Після розв'язання — нова група, стара звільнена (шпигуни `dispose`), `trophy.rotation.y` той самий, `data-decor` новий.
    - `the latest update wins`: `update(A)`, `update(B)`, потім розв'язати `B` раніше за `A` → у сцені `B`. Пізній `A` звільнено одразу, і в сцену він не потрапив.
    - `update does not replay the appearance`: `'drop:done'` → `update` з іншим ефектом → `data-appearance 'drop:done'`, `data-effect` новий. Без `decor` → з `decor` → `'<kind>:skipped'`.
    - `replay after update plays the new appearance`: `decor` з `'spin'`, `appear:false` → `update` з `'drop'` → `replayAppearance()` до розв'язання збірки → після заміни `data-appearance 'drop:playing'`, група на `y = 3·r` першого кадру.
    - `update after dispose is a no-op`: без винятку, `loadModel` не викликано.
  - `TrophyView.test.tsx`:
    - `a new look updates instead of remounting`: зміна `trophy` → `handle.update` з новим `look`, `mount` викликано раз, `.trophy-fallback` не з'являється;
    - `a new size remounts`: зміна `size` → `dispose` і новий `mount`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/trophy-engine.test.ts apps/web/src/trophy/TrophyView.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати.** У `trophy-engine.ts` винести збирання (модель, `decor`, тінь, ефект, реквізит появи, кадрування) у `build(look, generation)`, що повертає набір для заміни. `mount` і `update` користуються ним. У `TrophyView.tsx` `lookKey` вийде із залежностей ефекту `mount` і піде в окремий ефект, що викликає `update`.
- [ ] **Step 4: Тести, типи**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/screens/MyPrize.test.tsx apps/web/src/profile`, `pnpm --filter @quiz/web exec tsc --noEmit`.
  Expected: PASS. tsc чисто, окрім імпорту `isPickableTrophy` у `PrizeEditor.tsx` (прибирає задача 8) і наявних помилок e2e DOM.
- [ ] **Step 5: Commit** `feat(web): 25c TrophyHandle.update rebuilds the decor in place — the old frame stays until the new one is ready, the turn is kept, the latest look wins`

---

### Задача 8. Редактор: повноекранний шар, маршрути, «Форма» й «Приз», заміна `PrizeEditor`

**Files:**
- Create: `apps/web/src/prizes/PrizeStudio.tsx`, `apps/web/src/prizes/PrizeStudio.test.tsx`, `apps/web/src/prizes/tools/ShapeTool.tsx`, `apps/web/src/prizes/tools/PrizeTool.tsx`, `apps/web/src/prizes/useSettled.ts`, `apps/web/src/pages/PrizeStudioPage.tsx`, `apps/web/src/pages/PrizeStudioPage.test.tsx`
- Modify: `apps/web/src/AppRoutes.tsx` (маршрути `/profile/prizes/new` і `/profile/prizes/:id`), `apps/web/src/pages/Prizes.tsx` (без `PrizeEditor`: навігація; «Переглянути» для зарезервованих), `apps/web/src/styles.css` (`.prize-studio`, `.studio-*`; правила, що були лише для `.prize-editor`, `.prize-part`, `.prize-choice`, `.prize-preview`, прибрати), `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts` (`ADDED_25C`), 6 json
- Delete: `apps/web/src/prizes/PrizeEditor.tsx`, `apps/web/src/prizes/PrizeEditor.test.tsx`
- Test: `apps/web/src/pages/Prizes.test.tsx`, `apps/web/src/AppRoutes.test.tsx`, `apps/web/src/theme.test.ts` (за потреби), `apps/web/src/styles-rtl.test.ts` (має пройти)

**Interfaces:**
- Consumes: `StudioDraft`, `draftFrom`, `contentOf`, `studioLook`, `studioReducer`, `studioIssues` (задача 3); `TrophyView` з `ref`/`update` (задача 7); `webglAvailable` (`trophy/loadEngine`); `reducedMotion` (`motion.ts`).
- Produces:
  ```ts
  // PrizeStudio.tsx
  export type StudioTool = 'shape' | 'photos' | 'texts' | 'effects' | 'appear' | 'prize';
  export interface ToolProps { draft: StudioDraft; dispatch: (action: StudioAction, typing?: boolean) => void; level: number; replay: () => void } // інструменти задач 9–11 мають саме цей тип
  export interface PrizeStudioProps {
    initial: PrizeContent | null;
    readOnly: boolean;            // зарезервований: без «Зберегти» й без інструментів, лише studioReadOnly
    level: number;
    busy: boolean;
    error: string | null;
    onSave: (content: PrizeContent) => void;
    onCancel: () => void;
  }
  export function PrizeStudio(props: PrizeStudioProps): JSX.Element;
  // useSettled.ts
  export function useSettled<T>(value: T, ms: number): T; // ms 0 — те саме значення в тому самому рендері
  ```
  Панелі «Фото», «Написи», «Ефекти», «Поява» в цій задачі — заглушки (`null`). Задачі 9–11 підставляють туди свої інструменти з `ToolProps`.
  Текст помилок `studioIssues`: `prize_empty` → `err_prize_empty`, `name` → `prizeNameRequired`, `decor_*` → `err_decor_*`, `fill` → `prizeFillOptions`.
  - Вкладки йдуть у порядку `shape, photos, texts, effects, appear, prize`. Кожна — `<button role="tab" id="studio-tab-<tool>" aria-controls="studio-panel" aria-selected>`. ←/→ (у RTL дзеркально), Home/End.
  - Полотно кубка має `aria-describedby` на прихований `studioRotateHint`.
  - `PrizeStudioPage` вирішує `initial`/`readOnly` за `useParams().id`, зберігає через `createPrize`/`updatePrize` і показує `errorText(result.error)`.

- [ ] **Step 1: Тести**
  - `PrizeStudio.test.tsx` (`vi.mock('../trophy/TrophyView')` — фальшивий компонент, що пише `trophy` у `data-look` і має `ref` з `replayAppearance: vi.fn()`):
    - `six tools in a tablist`: `getAllByRole('tab')` мають назви `Форма, Фото, Написи, Ефекти, Поява, Приз`. Для нового призу вибрана «Форма». `ArrowRight` переводить фокус і вибір на «Фото», `End` — на «Приз».
    - `a tap on the active tab folds the drawer`: `aria-expanded` `true` → `false`, панель має `hidden`.
    - `shape changes the trophy at once`: радіо «медаль» і «Срібло» → `data-look` має `kind 'medal'`, `material 'silver'`. «Без трофея» → кубка немає, текст `studioNoTrophyHint`; вкладка «Фото» `aria-disabled="true"` і показує `studioNeedsTrophy`.
    - `the prize tool`: «Назва», «Підпис під кубком і на дипломі», «Титул біля ніку» (поле `prizeTitleText`), перемикач «Справжній приз» показує текст і `ImageField`, «Диплом». «Зберегти» передає `onSave` вміст `contentOf`.
    - `save is blocked with a reason`: порожня назва → «Зберегти» `disabled`, видно `prizeNameRequired`.
    - `saving an old prize sends no decor`: `initial` — медаль без `decor`, змінити назву → `onSave` отримав `trophy` без ключа `decor`.
    - `read only`: `readOnly` → немає кнопки «Зберегти» і вкладок, видно `studioReadOnly`, кубок є.
    - `no WebGL explains`: `webglAvailable` → `false` → видно `studioNoWebgl`, інструменти працюють.
    - `cancel asks only when changed`: без змін «Скасувати» → `onCancel` без `confirm`. Після зміни назви → `window.confirm` з `studioLeaveConfirm`, `false` → `onCancel` не викликано.
    - `useSettled` (окремий `describe` у тому самому файлі, `renderHook` і `vi.useFakeTimers`): з `ms 300` нове значення з'являється лише через 300 мс, а друга зміна за 100 мс переносить строк; з `ms 0` — одразу. Напис, що з'являється не відразу, перевіряє задача 10.
  - `PrizeStudioPage.test.tsx` (моки `api` як у `Prizes.test.tsx`):
    - `new saves and goes back`: `/profile/prizes/new` → назва → «Зберегти» → `createPrize` з `name`, перехід на `/profile/prizes`;
    - `edit loads the prize`: `/profile/prizes/p1` з вільним `p1` → вкладка «Приз» вибрана, поле «Назва» має назву, «Зберегти» → `updatePrize('p1', …)`;
    - `a reserved prize is view only`: `status 'reserved'` → `studioReadOnly`, «Зберегти» немає;
    - `unknown id`: `studioNotFound`;
    - `server error stays on the page`: `createPrize` → `{ ok:false, error:'decor_locked' }` → видно текст `err_decor_locked`, адреса та сама.
  - `Prizes.test.tsx`:
    - тести форми замінити на `new opens the studio` («Новий приз» → `/profile/prizes/new`) і `edit opens the studio` (→ `/profile/prizes/<id>`);
    - `reserved prize is viewed, not edited`: на зарезервованому «Переглянути» є, «Змінити» немає.
  - `AppRoutes.test.tsx`: `/profile/prizes/new` рендерить редактор (заголовок `studioNewTitle`).
  - `i18n.test.ts`: `ADDED_25C` з ключами цієї задачі. У задачах 9–11 список доповнюється.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/pages/PrizeStudioPage.test.tsx apps/web/src/pages/Prizes.test.tsx apps/web/src/AppRoutes.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати.**
  - Компоненти, маршрути, стилі з «Рішень → Макет C»: палітра 23a, цілі ≥ 44 px, логічні властивості, `:focus-visible`.
  - uk-рядки цієї задачі з таблиці (шапка, вкладки, «Форма» без наліпок, «Приз», `studioNoWebgl`, `studioReadOnly`, `studioLeaveConfirm`, `studioNotFound`, `prizeViewOpen`, `err_decor_*`) і їх переклади в 6 json.
  - Видалити `PrizeEditor` і його CSS.
- [ ] **Step 4: Тести, типи, локалі**
  Run:
  - `pnpm vitest run --maxWorkers=2 apps/web`;
  - `pnpm --filter @quiz/web exec tsc --noEmit`;
  - для кожної з `en pl de es it ar`: `pnpm l10n check <lang>`.

  Expected: PASS. tsc чисто (окрім наявних помилок e2e DOM). l10n без зауважень. `grep -rn "PrizeEditor\|isPickableTrophy" apps packages --include=*.ts --include=*.tsx` (крім `e2e`) порожній.
- [ ] **Step 5: Commit** `feat(web): 25c the fullscreen prize studio replaces the old prize form — six-tool drawer, shape and prize tools, view-only reserved prizes, routes under /profile/prizes`

---

### Задача 9. Інструмент «Фото»: місце, кілька файлів, порядок, кадрування, рамка, стиль

**Files:**
- Create: `apps/web/src/prizes/tools/PhotoTool.tsx`, `apps/web/src/prizes/tools/CropDialog.tsx`, `apps/web/src/prizes/tools/PhotoTool.test.tsx`
- Modify: `apps/web/src/prizes/PrizeStudio.tsx` (вкладка `photos`), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, 6 json

**Interfaces:**
- Consumes: `ToolProps` (задача 8); `photoLimit`, дії `photoPlace`/`addPhotos`/`movePhoto`/`removePhoto`/`crop`/`frame`/`photoStyle` (задача 3); `PHOTO_BOX`, `panCrop`, `zoomCrop`, `CROP_RESET` (задача 3); `coverCrop` (`decor-layout.ts`); `uploadImage` (`api.ts`), `ACCEPT` (`editor/ImageField.tsx`), `IMAGE_LIMITS`.
- Produces: `export function PhotoTool(props: ToolProps): JSX.Element`.
  - Місця — лише з `DECOR_SUPPORT[kind].photo`, радіогрупа `studioPhotoPlace`.
  - Кнопка-файл «Додати фото» (`<input type="file" multiple accept={ACCEPT}>`). Файли вантажаться по одному, не більше вільних місць. Неприйнятий тип чи розмір → `errorText('bad_image' | 'too_large')`, цей файл пропускається. Помилка `uploadImage` (зокрема `too_many`) зупиняє пачку, уже завантажені лишаються. Під час завантаження кнопка `disabled` з `uploading`.
  - Лічильник `studioPhotoCount` («3 з 16»). Межа досягнута → кнопка `disabled` і `studioPhotoFull`.
  - Кожне фото — мініатюра (`img`, `alt` = `studioPhotoN`) з кнопками «Раніше», «Пізніше», «Кадрувати», «Прибрати». `aria-label` кнопок містить номер фото: `«Раніше: Фото 2»`. Крайні кнопки `disabled`.
  - Для `backdrop` — підказка `studioBackdropHint`. Рамка (4) і стиль (3) — радіогрупи.
  - `CropDialog`: портал, `role="dialog"`, `aria-modal`, фокус на повзунку, Tab колом, Escape закриває без змін. Полотно 2D 280 px завширшки з пропорцією `PHOTO_BOX[place]`. Тяг (`pointer*`) → `panCrop`, `input[type=range]` 1–4 крок 0.05 → `zoomCrop`, стрілки → `panCrop` на `0.02·viewWidth`. «Скинути» → `CROP_RESET`, «Готово» → дія `crop`.

- [ ] **Step 1: Тести `PhotoTool.test.tsx`** (`vi.mock('../../api')`, `uploadImage` повертає `{ ok:true, url:'/uploads/<n>.png' }`)
  - `places follow the kind`: кубок → 5 місць; медаль → `Медальйон спереду, Самоцвіти, Фон за кубком`.
  - `a batch stops at the place limit`: `Медальйон спереду`, вибрано 3 файли → `uploadImage` викликано раз, у чернетці 1 фото, кнопка «Додати фото» `disabled`, видно `studioPhotoFull`.
  - `a failed upload keeps the photos already added`: кільце, 3 файли, другий → `{ ok:false, error:'too_many' }` → у чернетці 1 фото, третій не надіслано, видно `errorText('too_many')`.
  - `wrong file is skipped`: `image/gif` → `err_bad_image`, `uploadImage` не викликано.
  - `order buttons`: 3 фото → «Раніше: Фото 3» → порядок `[0, 2, 1]`; «Раніше: Фото 1» `disabled`.
  - `crop dialog`: «Кадрувати: Фото 1» → діалог з повзунком «Масштаб» у фокусі. Повзунок на 2 → «Готово» → `crop.scale === 2`. Escape після зміни → чернетка без змін. `ArrowLeft` → `x` збільшився.
  - `frame and style`: «Золота» і «Сепія» → `frame 'gold'`, `photoStyle 'sepia'`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes/tools/PhotoTool.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** `PhotoTool`, `CropDialog`, uk-рядки фото й кадрування з таблиці та переклади.
- [ ] **Step 4: Тести й локалі**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles-rtl.test.ts apps/web/src/theme.test.ts`, `pnpm l10n check <lang>` для шести мов.
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25c studio photo tool — place, several files within the limit, order, per-photo crop on the trophy's frame, frame and style`

---

### Задача 10. «Написи» і наліпки: закриті за рівнем шрифти й наліпки

**Files:**
- Create: `apps/web/src/prizes/tools/TextTool.tsx`, `apps/web/src/prizes/tools/StickerPicker.tsx`, `apps/web/src/prizes/tools/ColorField.tsx`, `apps/web/src/prizes/tools/TextTool.test.tsx`, `apps/web/src/prizes/tools/StickerPicker.test.tsx`
- Modify: `apps/web/src/prizes/tools/ShapeTool.tsx` (розділ «Наліпки»), `apps/web/src/prizes/PrizeStudio.tsx` (вкладка `texts`), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, 6 json

**Interfaces:**
- Consumes: `ToolProps`; дії `inscription`, `sticker` (задача 3); `STUDIO_SWATCHES`, `INSCRIPTION_COLOR`; `lookLevel`, `stickerOpen`, `seriesLevel`, `STICKERS`, `stickerPath`, `stickerOf`, `DECOR_LIMITS`, `DECOR_SUPPORT`, `NICK_FONTS` (shared); `NICK_FONT_FAMILY`, `loadNickFont` (`nick-fonts.ts`).
- Produces:
  ```ts
  export function TextTool(props: ToolProps): JSX.Element;
  export function StickerPicker(props: { kind: TrophyKind; stickers: TrophyDecor['stickers']; level: number; onPick: (place: StickerPlace, id: string | null) => void }): JSX.Element;
  export function ColorField(props: { label: string; value: string; onChange: (hex: string) => void }): JSX.Element; // радіогрупа STUDIO_SWATCHES (назви swatch_*) + <input type="color"> «Свій колір»
  ```
  - `TextTool`: для кожного місця форми — `fieldset` з перемикачем (`checkbox`, назва `studioText_<place>`).
    - Увімкнений показує поле «Текст»: `textarea rows=2` для `plaque`, інакше `input`, `maxLength = DECOR_LIMITS[place]`, лічильник `studioTextCount`.
    - Шрифт — радіогрупа: «Класичний» + 8 `font_*`, плитка «Аа» своїм шрифтом. Відкриті шрифти вантажаться `loadNickFont`.
    - Вигляд — 3 радіо. Колір — `ColorField`.
    - Табличку зайняло фото (`photoPlace 'plaque'` з фото) → перемикач `disabled` і `studioPlaqueTaken`.
  - Закритий шрифт: радіо `disabled`, підпис `lookLocked` + `levelFromLevel(n)`. Збережений у цьому призі закритий шрифт лишається вибраним і `disabled` не стає (як на сервері).
  - `StickerPicker`: для кожного місця з `DECOR_SUPPORT[kind].sticker` — кнопка з назвою місця (`studioPlace_*`) і поточною мініатюрою. Дотик розкриває сітку: `studioStickerNone` і всі `STICKERS` за серіями, кожна клітинка ≥ 44 px, `img` — `stickerPath` (`alt` — `id`). Закриті: `disabled`, `🔒 n` і `sr-only` текст `lookLocked`.

- [ ] **Step 1: Тести**
  - `TextTool.test.tsx`:
    - `places follow the kind`: кубок → 4 перемикачі; медаль → лише «Зворот»; корона → «Поясок», «Табличка».
    - `typing an inscription`: «По колу на вінці» → поле «Текст» → `'Чемпіон'` → чернетка має `{ place:'rim', text:'Чемпіон', font:null, look:'engraved', color:'#3a2a0e' }`. Лічильник `7/80`. Вимкнути → напис зник.
    - `typing settles before the trophy` (усередині `PrizeStudio` з фальшивим `TrophyView`, `vi.useFakeTimers`): після введення тексту `data-look` ще без нього, а через 300 мс — з ним. Перемикач «Рельєфний» міняє `data-look` одразу.
    - `fonts lock by level`: `level 1` → «Рукописний» і «Круглий» `enabled`, «Моноширинний» `disabled` з текстом `🔒 з рівня 3`. `level 3` → `enabled`.
    - `a saved locked font stays`: `initial` з `font 'heavy'` при `level 1` → радіо «Грубий» вибране й не `disabled`.
    - `look and colour`: «Рельєфний» → `look 'embossed'`. Зразок «Блакитний» → `color '#4fc3f7'`. `input[type=color]` → `'#123456'`.
    - `plaque taken by a photo`: `photoPlace 'plaque'` з фото → перемикач «Табличка» `disabled`, видно `studioPlaqueTaken`.
  - `StickerPicker.test.tsx`:
    - `places follow the kind`: медаль → 4 місця.
    - `pick and clear`: «Спереду» → перша наліпка `'nya'` → `onPick('front', id)`; «Без наліпки» → `onPick('front', null)`.
    - `locked series`: `level 1` → клітинка наліпки серії `'nyaa'` `disabled`, текст `🔒 3`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes/tools/TextTool.test.tsx apps/web/src/prizes/tools/StickerPicker.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати**, uk-рядки написів, наліпок і кольорів з таблиці та переклади.
- [ ] **Step 4: Тести й локалі**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/styles-rtl.test.ts apps/web/src/theme.test.ts`, `pnpm l10n check <lang>` для шести мов.
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25c studio inscriptions and stickers — every place of the shape, fonts and stickers locked by level with the level they open at, look and colour`

---

### Задача 11. «Ефекти» й «Поява»: колір сяйва, кнопка «Показати появу», «менше руху»

**Files:**
- Create: `apps/web/src/prizes/tools/EffectTool.tsx`, `apps/web/src/prizes/tools/AppearTool.tsx`, `apps/web/src/prizes/tools/EffectTool.test.tsx`
- Modify: `apps/web/src/prizes/PrizeStudio.tsx` (вкладки `effects`, `appear`; `replay` → `ref.current?.replayAppearance()`), `apps/web/src/styles.css`, `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, 6 json

**Interfaces:**
- Consumes: `ToolProps`; дії `effect`, `appearance` (задача 3); `ColorField` (задача 10); `TROPHY_EFFECTS`, `TROPHY_APPEARANCES` (shared); `GLOW_DEFAULT` (`trophy/effect-plan.ts`, модуль без `three`); `reducedMotion`.
- Produces:
  - `EffectTool`: радіогрупа з 6 `studioEffect_*`. Для `glow` під нею `ColorField` «Колір сяйва». Під reduced motion — `studioCalmNote`.
  - `AppearTool`: радіогрупа з 4 `studioAppear_*`. Вибір програє анімацію (`replay()` після того, як `useSettled` віддав новий `look`, тобто в наступному ефекті). Кнопка «Показати появу» → `replay()`. Під reduced motion кнопка `disabled`, `aria-describedby` → `studioCalmNote`.

- [ ] **Step 1: Тести `EffectTool.test.tsx`** (інструменти всередині `PrizeStudio` з фальшивим `TrophyView`)
  - `effects`: 6 радіо в порядку `TROPHY_EFFECTS`. «Сяйво» → `effect { kind:'glow', color:'#ffd36b' }`, видно «Колір сяйва». «Блакитний» → `color '#4fc3f7'`. «Вогонь» → `{ kind:'fire' }` без `color`, поле кольору зникло.
  - `appearance plays`: «Падіння з неба» → `appearance 'drop'` і `replayAppearance` фальшивого `ref` викликано раз. «Показати появу» → ще раз.
  - `reduced motion`: `matchMedia` reduce → «Показати появу» `disabled`, видно `studioCalmNote` в обох вкладках, вибір анімації `replayAppearance` не викликає.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes/tools/EffectTool.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати**, uk-рядки ефектів і появи з таблиці та переклади.
- [ ] **Step 4: Тести, типи, збірка**
  Run:
  - `pnpm vitest run --maxWorkers=2 apps/web`;
  - `pnpm -r exec tsc --noEmit`;
  - `pnpm --filter @quiz/web build`;
  - `pnpm l10n check <lang>` для шести мов.

  Expected: PASS. У `apps/web/dist/assets` один `trophy-engine-*.js`, жоден `index-*.js` не містить `WebGLRenderer` (`grep -l`).
- [ ] **Step 5: Commit** `feat(web): 25c studio effects and appearances — glow colour, the appearance plays on pick and on «Показати появу», still under reduced motion`

---

### Задача 12. e2e «part 25c», оновлення 14a і 25b, знімки

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`:
  - новий `it` після «part 25b», функція `trophyEditor25c()`, стиль `try { … } catch { await snapshot(); throw }`;
  - перевикористовуються без копіювання: `COUNT_WEBGL_25A`, `isTrophyRequest`, лобі й гра частин 25a/25b, `expectNoSideScroll`, `openProfileTile`;
  - частина 14a, рядки ~17303–17326: призи створюються в редакторі;
  - частина 25b, крок 6, рядки ~21313–21339: прев'ю старої форми → редактор.

**Interfaces:**
- Consumes: усе вище. Атрибути `data-decor`/`data-effect`/`data-appearance` у тесті — літерали, без імпорту вебмодулів.

- [ ] **Step 1: Оновити 14a.** «Новий приз» → `waitForURL(/\/profile\/prizes\/new$/)`. «Форма»: «кубок», «Золото». Вкладка «Приз»: «Назва», «Підпис під кубком і на дипломі» ← `ENGRAVING`, «Справжній приз» + «Що за приз», «Титул біля ніку» ← `KING`, «Диплом». Знімок `p14a-prize-editor` лишається, тепер це редактор (`expectNoSideScroll`). «Зберегти» → список. Медаль `Срібло` так само. Решта 14a без змін.
- [ ] **Step 2: Оновити 25b, крок 6.** «Змінити» на «Іскри 25b» і «Промені 25b» → `.prize-studio canvas.trophy-canvas`:
  - `data-effect` `'sparks:animated'` і `'rays:animated'` (розмір `view`);
  - `data-appearance` `'spin:skipped'` (`appear={false}`);
  - знімки `p25b-form-sparks`, `p25b-form-rays`, далі «Скасувати».

  «Новий приз» без змін оформлення → `data-decor` дорівнює підсумку порожнього оформлення (`decorSummary('cup', EMPTY_DECOR)`, у тесті — літерал), `data-effect 'none:off'`, `data-appearance 'spin:skipped'`, бо в чернетки є `EMPTY_DECOR`. Далі «Скасувати».

  Назву кроку й рядок у назві `it` («sparks and rays show in the prize form preview») змінити на «…in the prize studio».
- [ ] **Step 3: Написати сценарій 25c**
  Назва: `part 25c: trophy editor — Оля makes a gold cup in the fullscreen studio on a phone: three photos on the ring with one moved and one cropped in a gold frame, a rim inscription in the hand font with an embossed look, a two-line plaque, a front sticker, a blue glow and a drop from the sky that plays on «Показати появу»; the caption under the cup goes to the diploma; a locked font is shown with its level and refused by the server; a grail is open again; a reserved prize is view only; the cup looks the same on the stage ceremony and in Петро's showcase; no WebGL explains, reduced motion keeps it still, Arabic mirrors the drawer`.
  1. Оля (телефон 390×844), «Профіль → Призи» → «Новий приз» → `/profile/prizes/new`. Вкладок 6, «Форма» вибрана. `expectNoSideScroll` на 390 і 360. Знімок `p25c-studio-shape`.
  2. «Форма»: «кубок», «Золото». «Наліпки» → «Спереду» → перша клітинка серії `nya`.
  3. «Фото»: «Кільце по чаші». `setInputFiles` трьох PNG 400×300, намальованих у сторінці (`canvas.toDataURL` → буфер; червоний, зелений, синій). Лічильник «3 з 16».
     - «Раніше: Фото 3» → порядок синій, червоний, зелений (перевірка через `img` `src` за порядком).
     - «Кадрувати: Фото 1» → повзунок «Масштаб» на 2 → знімок `p25c-studio-crop` → «Готово».
     - «Золота».
     - Знімок `p25c-studio-photos`.
  4. «Написи»:
     - «По колу на вінці» → «Текст» `Чемпіон вечора`, шрифт «Рукописний», «Рельєфний»;
     - «Табличка» → `Оля дарує` Enter `Петрові`;
     - «Грубий» `disabled` з текстом `🔒 з рівня 24`;
     - знімок `p25c-studio-texts`.
  5. «Ефекти»: «Сяйво», «Блакитний» → полотно `data-effect 'glow:animated'`. Знімок `p25c-studio-effects`.
  6. «Поява»: «Падіння з неба» → `data-appearance` доходить до `'drop:done'` (poll ≤ 5 с). «Показати появу» → спершу `'drop:playing'`, потім `'drop:done'`.
  7. «Приз»: «Назва» `Кубок 25c`, «Підпис під кубком і на дипломі» `За найкращу гру`, «Диплом». Знімок `p25c-studio-prize`. «Зберегти» → `/profile/prizes`, у списку `Кубок 25c`.
  8. `GET /api/me/prizes` (через `olya.request`): у `Кубок 25c`:
     - `decor.photos.length === 3`, у першого `crop.scale === 2`, `frame 'gold'`;
     - `inscriptions` = `rim` (`font 'hand'`, `look 'embossed'`) і `plaque` (`'Оля дарує\nПетрові'`);
     - `effect { kind:'glow', color:'#4fc3f7' }`, `appearance 'drop'`, одна наліпка `front`;
     - `engraving 'За найкращу гру'`, `diploma true`.

     Запам'ятати `data-decor` полотна редактора (`studioDecor`) — перед збереженням, на кроці 7.
  9. Сервер: `POST /api/me/prizes` з написом `font 'heavy'` → 409 `{ error:'decor_locked' }`.
  10. Грааль: «Новий приз» → «грааль» → «Фото» → «Медальйон спереду», 1 PNG → «Приз» → `Грааль 25c` → «Зберегти». У `GET` його `trophy.kind 'grail'` з `decor.photoPlace 'medallion'`. Запит до `grail-family.glb` за весь сценарій не з'являється (`page.on('request')`).
  11. Лобі: місце 1 = `Кубок 25c`. Оля відкриває «Мої призи» → на `Кубок 25c` є «Переглянути», немає «Змінити». «Переглянути» → `studioReadOnly`, кнопки «Зберегти» немає. Знімок `p25c-studio-readonly`. Назад.
  12. Гра (як 25b): Петро перший.
      - Сцена: `.trophy-fallback` зник; `data-decor === studioDecor`; `data-effect 'glow:animated'`; `data-appearance` → `'drop:done'`; під кубком текст `За найкращу гру`; `window.__webglCalls ≤ 2`. Знімок `p25c-stage-ceremony`.
      - Телефон Петра «Твій приз»: `data-decor === studioDecor`.
  13. Вітрина: Оля відкриває публічний профіль Петра → `shelf-cup` → перегляд: `data-decor === studioDecor`, `data-effect 'glow:animated'`. Знімок `p25c-showcase-viewer`.
  14. Без WebGL (контекст без WebGL так само, як у кроці «без WebGL» частини 25a): `/profile/prizes/new` → видно `studioNoWebgl` і `.trophy-fallback`, вкладки й поля клікаються. Знімок `p25c-studio-nowebgl`.
  15. `reducedMotion: 'reduce'`: `/profile/prizes/new` → «Ефекти» → «Сяйво» → `data-effect 'glow:static'`, видно `studioCalmNote`. «Поява» → «Показати появу» `disabled`.
  16. Арабська: контекст з мовою `ar` (як у частині 23a) → `/profile/prizes/new` → `document.dir === 'rtl'`, `expectNoSideScroll` на 360, перша вкладка праворуч (`boundingBox().x` першої > останньої). Знімок `p25c-studio-ar`.
  17. `expect(problems).toEqual([])`.
- [ ] **Step 4: Збірка й прогін**
  Run: `pnpm build`, далі `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25c"`
  Expected: PASS; 11 знімків `p25c-*` в `apps/server/e2e/artifacts/shots/`.
- [ ] **Step 5: Регресія сусідніх частин**
  Run: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 14a|part 25a|part 25b"`, потім `-t "part 23a|part 21a"` (окремими викликами, кожен до 10 хв).
  Expected: PASS.
- [ ] **Step 6: Переглянути знімки очима**
  - Кубок видно над шухлядою на 390×844, шухляда не закриває більше половини екрана.
  - Кільце фото в порядку синій, червоний, зелений, у першого видно збільшений кадр, рамка золота.
  - Рим рукописним шрифтом, табличка у два рядки, наліпка спереду.
  - Блакитне гало без чорного квадрата.
  - Кубок на сцені й у вітрині такий самий, як у редакторі.
  - У RTL вкладки й поля дзеркальні.
  - Кільце корони й зірки на `p25a-*` після задачі 6 не «пливуть»: прогнати `-t "part 25a"` з `E2E_SHOTS=1` і подивитися.

  Розбіжності з «Рішеннями» виправляти в коді, не в тестах.
- [ ] **Step 7: Повний набір**
  Run: `pnpm vitest run --maxWorkers=2 apps/web`, `pnpm vitest run --maxWorkers=2 apps/server`, `pnpm vitest run --maxWorkers=2 packages`.
  Expected: PASS.
- [ ] **Step 8: Commit** `test(e2e): part 25c the prize studio end to end — a decorated cup made on a phone, attached, played, the same on the ceremony and in the winner's showcase; 14a and 25b use the studio`
