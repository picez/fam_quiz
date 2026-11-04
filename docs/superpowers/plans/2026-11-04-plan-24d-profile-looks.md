# План 24d: оформлення профілю — рамки фото, шрифти ніку, нові кольори, емодзі статусу

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** на сторінці «Вигляд» (/profile/looks) гравець із живим переглядом обирає рамку фото (12), шрифт ніку (8, з кирилицею), колір ніку (7 наявних + 6 градієнтів), рамку ніку (6 наявних) і емодзі статусу (36). Частину відкрито з першого рівня, решту дають рівні 1–30. Сервер перевіряє, чи вибір дозволяє рівень. Шрифт і колір видно скрізь, де вже є `Nick`, зокрема в грі (з обмеженням розміру й «…»). Рамку фото видно в шапці власного й публічного профілю.

**Spec:** `docs/superpowers/specs/2026-11-04-likes-lobbies-looks-design.md`. Обов'язкові лише **«24d. Оформлення профілю»**, **«Загальні обмеження»** і **«Рішення після перевірки builder-ом» → 24d**. 24b і 24c уже злито.

**Архітектура:**
- **shared** (`packages/shared/src/levels.ts`): нові каталоги `PHOTO_FRAMES`, `NICK_FONTS`, розширені `NICK_COLORS` і `PROFILE_BADGES`; `FREE_LOOKS` (вільне з першого рівня, у нагороди не входить); `EXTRA_REWARDS` додаються до незмінних `REWARD_ROWS` (на рівні може бути кілька нагород). `NickLooks` отримує `photo` і `font`, `NickLevel` — лише `font` (рамка фото в гру не йде).
- **сервер:** міграція `0031_profile_looks` (колонки `photo_frame`, `nick_font` у `profile`); `xp-store.ts` читає й пише нові поля; `roomLevels` і `RoomManager.setLevels` передають `font`. Шрифт приходить у гру через `room.levels` → `levelsView` → `view.levels`, тобто через дані сервера, а не через `GameState`. Тому `GAME_STATE_VERSION` лишається 22, а `SavedRoom` не змінюється (`room.levels` після відновлення збирається заново).
- **веб:** `apps/web/src/nick-fonts.ts` вантажить CSS шрифту динамічним `import()`, лише коли шрифт треба показати. `apps/web/src/profile/AvatarFrame.tsx` малює рамку фото (CSS + inline SVG з мотивів). `Nick.tsx` додає клас шрифту. `LevelCard.tsx` отримує сітку вибору з переглядом.

**Технології:** TypeScript, zod, Drizzle + PGlite (тести), Fastify, React 19 + Testing Library (jsdom), Vite (динамічний імпорт CSS), `@fontsource`/`@fontsource-variable`, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`). Пакет `packages/engine` не змінюється. Шрифт ніку йде лише через `NickLevel` у `room.levels` / `BaseView.levels` (ставить сервер). Якщо без підняття версії ніяк — зупинитися й спитати власника до пушу.
- Наявні 30 рядків `REWARD_ROWS` лишаються на своїх рівнях, у тому самому порядку. Нічого не переїжджає вище (рішення 24d.2). Рівні лишаються 1–30 (рішення 24d.5).
- Поведінка при падінні рівня та сама: `looksShown` перетворює закрите на `null`. Це стосується й нових полів (рішення 24d.1).
- Рамка ніку (`frame`) і рамка фото (`photo`) незалежні, можна обрати обидві (рішення 24d.3).
- `photo: null` означає наявне кільце томое (`TomoeRing`): у тих, хто нічого не обрав, шапка профілю не змінюється.
- Шрифти: лише 8 пакетів із задачі 3, усі з підмножиною `cyrillic` (перевірено в API fontsource). Жодних шрифтів із «рус»/«russ» у назві, жодних Paratype (PT …). У `main.tsx` їх не імпортувати: CSS шрифту вантажиться лише через `loadNickFont`. Арабське письмо бере запасний системний шрифт (стек `…, system-ui, sans-serif`).
- Рух лише всередині `@media (prefers-reduced-motion: no-preference)`.
- Контраст ≥ AA: кожна точка градієнта кольору ніку дає ≥ 4.5:1 до `--surface`. Фокус видно, усе з клавіатури (нативні `input type="radio"`), дотики ≥ 44 px. RTL — логічні властивості.
- Емодзі статусу: без прапорів (жодного 🏳/🏴/регіональних індикаторів), нічого, пов'язаного з росією.
- Нові uk-ключі — **лише** зі списку `ADDED_24D` (задача 3). Змінено один uk-текст: `lookFrame` «Рамка» → «Рамка ніку» (дописати в `CHANGED_LATER`). Тексти в 7 мовах: uk в `apps/web/src/i18n.ts`; en, pl, de, es, it, ar у `apps/web/src/locales/<lang>.json`. Тон «ти», ru — ніколи. `pnpm l10n check <lang>` має бути чистим для en pl de es it ar.
- Кириличні літерали лише в словниках (`source-scan.test.ts`).
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Для e2e спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24d"`, лише на передньому плані.
- Кожна задача закінчується комітом у гілці `profile-looks` (з `main`).

## Review Focus

- Відкрита до деплою вкладка шле старе тіло `PUT /api/me/looks` без `photo` і `font`: збережене лишається, без 400 (задача 2, тест `old client omits them`).
- Довгий нік у широкому шрифті (pixel, heavy) на телефоні 320 px і на сцені: обрізається «…», рядок не росте, бокового скролу немає (задача 3 — множники розміру; задача 7, крок 6).
- Шрифт не завантажився (офлайн, збій чанка): нік показано запасним шрифтом, без помилки й без вічного очікування (задача 3, тест `a failed load resolves`).
- Кілька нагород на одному рівні: «Відкрито»/«Далі» не дублюють ключі й не зсувають бонуси `perksFor` (задача 1 — тест perks; задача 5 — тест key warnings).
- Арабський нік чи інтерфейс ar з латинсько-кириличним шрифтом: гліфи беруться із системного запасного, розкладка дзеркальна (задача 3 — стек `system-ui, sans-serif`; задача 7 — знімки ar).

## Рішення (там, де специфікація лишила місце builder-ові)

**Каталоги** (порядок у масивах саме такий; нове дописується в кінець наявних):

- `PHOTO_FRAMES` (12): `crimson` (тонка багряна), `silver`, `ink` (мазок туші), `gold`, `cloud` (хмаринки Акацукі), `crows` (ворони), `fire`, `neon`, `thorns` (терни), `eclipse` (кривавий місяць), `storm` (блискавка), `aura` (сяйво, що обертається).
- `NICK_FONTS` (8) → пакет / `font-family`:
  - `hand`: `@fontsource-variable/caveat` / `'Caveat Variable'`
  - `round`: `@fontsource-variable/comfortaa` / `'Comfortaa Variable'`
  - `mono`: `@fontsource-variable/fira-code` / `'Fira Code Variable'`
  - `poster`: `@fontsource-variable/oswald` / `'Oswald Variable'`
  - `brush`: `@fontsource/amatic-sc` / `'Amatic SC'` (вага 700: `@fontsource/amatic-sc/700.css`)
  - `pixel`: `@fontsource-variable/pixelify-sans` / `'Pixelify Sans Variable'`
  - `elegant`: `@fontsource-variable/cormorant` / `'Cormorant Variable'`
  - `heavy`: `@fontsource/dela-gothic-one` / `'Dela Gothic One'`

  Усі 8 версії 5.3.0 є в npm, і в усіх є `cyrillic`. JetBrains Mono, Marck Script, Bad Script, Neucha, Kurale і Yeseva One свідомо не беремо (походження).
- `NICK_COLORS` (+6 градієнтів): `blood`, `flame`, `ice`, `venom`, `amethyst`, `moonsilver`.
- `PROFILE_BADGES` (+27, разом 36). Після наявних 9 іде: `🔥 😎 🎮 📚 🎵 ⚽ ☕ 🐱 🦊 🌙 🍀 🎲 🧩 🎨 🌻 🍕 🎸 🏀 🌊 🌸 🦄 🥷 🐺 👑 🐉 💀 👻`.

**Вільне з першого рівня** (`FREE_LOOKS`, не рядки нагород):
- рамки фото: `crimson`, `silver`, `ink`;
- шрифти: `hand`, `round`;
- колір: `blood`;
- емодзі: перші 20 нових, від 🔥 до 🌸.

**Нові нагороди** (`EXTRA_REWARDS`, `{ level, reward }`; на одному рівні їх може бути кілька):

| Рівень | Нове | | Рівень | Нове |
|---|---|---|---|---|
| 3 | шрифт `mono` | | 18 | емодзі 🥷 |
| 4 | рамка фото `gold` | | 19 | шрифт `elegant` |
| 6 | колір `flame` | | 20 | рамка фото `neon` |
| 7 | шрифт `poster` | | 21 | колір `amethyst` |
| 8 | рамка фото `cloud` | | 22 | емодзі 🐺 |
| 9 | колір `ice` | | 23 | рамка фото `thorns` |
| 10 | емодзі 💀 | | 24 | шрифт `heavy` |
| 11 | емодзі 🦄 | | 25 | емодзі 👑 |
| 12 | шрифт `brush` | | 26 | рамка фото `eclipse` |
| 13 | рамка фото `crows` | | 27 | колір `moonsilver` |
| 14 | колір `venom` | | 28 | емодзі 🐉 |
| 15 | емодзі 👻 | | 29 | рамка фото `storm` |
| 16 | шрифт `pixel` | | 30 | рамка фото `aura` |
| 17 | рамка фото `fire` | | | |

Рамки ніку й 9 наявних значків лишаються де були.

**Інші рішення:**
- **«Далі»:** нагороди трьох найближчих рівнів, на яких щось відкривається (`nextRewards(level)`). На «Вигляді» закриті варіанти видно в сітці вимкненими, з «🔒 з рівня N».
- **Дрібні аватари** (`size="small"`: лобі, друзі, стрічка) — без рамки фото. Рамка є лише на великому аватарі в шапці профілю (власного й публічного) і в переглядах на «Вигляді». `ProfileCard` не змінюється.
- **Шапка профілю:** нік у `h1` отримує колір і шрифт (раніше був без кольору). Значок, як і раніше, у `ProfileLevelMark`.
- **Старий клієнт** (відкрита вкладка до деплою) шле `PUT /api/me/looks` без `photo` і `font`. Відсутні поля означають «лишити збережене», а не 400 і не стирання.
- **Розмір шрифту в грі:** для кожного шрифту — свій множник `--nick-font-scale` (широкі менші, вузькі більші), `line-height: 1.2`, наявне в `.nick-name` `nowrap` + `ellipsis`.

---

### Задача 1. shared: каталоги, вільне, нагороди за рівнями, нові поля вигляду

**Files:**
- Modify: `packages/shared/src/levels.ts:56-174`
- Test: `packages/shared/src/levels.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PHOTO_FRAMES = ['crimson','silver','ink','gold','cloud','crows','fire','neon','thorns','eclipse','storm','aura'] as const;
  export type PhotoFrame = (typeof PHOTO_FRAMES)[number];
  export const NICK_FONTS = ['hand','round','mono','poster','brush','pixel','elegant','heavy'] as const;
  export type NickFont = (typeof NICK_FONTS)[number];
  // NICK_COLORS: + 'blood','flame','ice','venom','amethyst','moonsilver'; PROFILE_BADGES: + 27 (див. «Рішення»)
  export type LookSlot = 'color' | 'frame' | 'badge' | 'photo' | 'font';
  export type LevelReward = … | { kind: 'photo'; id: PhotoFrame } | { kind: 'font'; id: NickFont };
  export const FREE_LOOKS: { readonly [S in LookSlot]: readonly string[] }; // frame: []
  export const LOOK_IDS: { readonly [S in LookSlot]: readonly string[] };   // color→NICK_COLORS, frame→NICK_FRAMES, badge→PROFILE_BADGES, photo→PHOTO_FRAMES, font→NICK_FONTS
  export const LEVEL_REWARDS: readonly { level: number; reward: LevelReward }[]; // REWARD_ROWS (рівні 1..30) + EXTRA_REWARDS, стабільно за level
  export function lookLevel(slot: LookSlot, id: string): number; // вільне → 1; нагорода → її рівень; невідоме → Infinity (колишній unlockLevel)
  export function nextRewards(level: number): { level: number; reward: LevelReward }[];
  export interface NickLooks { color: NickColor|null; frame: NickFrame|null; badge: ProfileBadge|null; photo: PhotoFrame|null; font: NickFont|null }
  export type LooksInput = Omit<NickLooks, 'photo'|'font'> & Partial<Pick<NickLooks, 'photo'|'font'>>;
  export const looksSchema: z.ZodType<LooksInput>; // .strict(), photo/font — .nullable().optional()
  export function looksAllowed(looks: NickLooks, level: number): boolean;
  export function looksShown(looks: NickLooks, level: number): NickLooks;
  export interface NickLevel { level: number; color: NickColor|null; frame: NickFrame|null; font: NickFont|null }
  ```

- [ ] **Step 1: Оновити наявні й написати нові тести в `levels.test.ts`**
  - `keeps the 30 old rewards on their levels`: `LEVEL_REWARDS.filter(r => старі kind/id)` у порядку рівнів дорівнює буквальному списку з 30 пар `[level, reward]` з нинішнього `REWARD_ROWS` (1 `nya` … 30 `frame rainbow`). Старий тест `map(r => r.level) == [1..30]` замінити на цей.
  - `every look id is free or rewarded exactly once`: для кожного `slot` з `LOOK_IDS` і кожного `id` маємо (`FREE_LOOKS[slot].includes(id) ? 1 : 0`) + кількість рядків `LEVEL_REWARDS` з цим kind/id `=== 1`.
  - `LEVEL_REWARDS` levels are non-decreasing, every level is within 1..30, and every level 1..30 has at least one reward.
  - `counts`: `PHOTO_FRAMES.length === 12`, `NICK_FONTS.length === 8`, `NICK_COLORS.length === 13`, `PROFILE_BADGES.length === 36`, без дублікатів. `PROFILE_BADGES.some(b => /\p{Regional_Indicator}|🏳|🏴/u.test(b)) === false`.
  - Таблиця з «Рішень»: `lookLevel('photo','aura') === 30`, `lookLevel('font','pixel') === 16`, `lookLevel('color','venom') === 14`, `lookLevel('badge','👑') === 25`, `lookLevel('photo','crimson') === 1`, `lookLevel('badge','🌻') === 1`, `lookLevel('color','sky') === 2`, `lookLevel('font','comic') === Infinity`.
  - `perksFor(20).timeMs === 10_000`, `perksFor(5).kinds` дорівнює `['time']` (нові рядки не зсунули бонуси).
  - `nextRewards(15)`: рівні результату дорівнюють `[16, 16, 17, 17, 18, 18]` (16: frame gold + font pixel; 17: badge 🧠 + photo fire; 18: color violet + badge 🥷). `nextRewards(30)` дорівнює `[]`.
  - `looksSchema`: `{ color:'sky', frame:null, badge:'⭐' }` → ok (старий клієнт). `{ …, photo:'fire', font:null }` → ok. `photo:'tomoe'` → помилка. Зайвий ключ → помилка.
  - `looksAllowed({ …none, photo:'fire' }, 16) === false`, `(…, 17) === true`; `looksAllowed({ …none, font:'hand' }, 1) === true`.
  - `looksShown({ color:'rainbow', frame:'bronze', badge:'⭐', photo:'aura', font:'hand' }, 10)` дорівнює `{ color:null, frame:'bronze', badge:'⭐', photo:null, font:'hand' }`.

- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/levels.test.ts`
  Expected: FAIL (немає `PHOTO_FRAMES`, `lookLevel` тощо).

- [ ] **Step 3: Реалізувати в `levels.ts`**
  `REWARD_ROWS` не чіпати. Додати `EXTRA_REWARDS` з таблиці «Рішень». `LEVEL_REWARDS` = старі рядки з `level: i + 1`, за ними `EXTRA_REWARDS`, далі стабільне сортування за `level`. `unlockLevel` замінити на експортований `lookLevel` (спершу `FREE_LOOKS`). `looksAllowed` і `looksShown` проходять усі п'ять слотів. `nextRewards` бере три найменші різні `level > level` і всі рядки цих рівнів.

- [ ] **Step 4: Виправити типи в споживачах, щоб збирався монорепозиторій**
  Run: `pnpm -r exec tsc --noEmit`
  Expected: помилки лише там, де будують `NickLooks`/`NickLevel` без нових полів (`xp-store.ts`, `manager.ts`, `LevelCard.tsx`, тести). Тимчасово дописати `photo: null, font: null` / `font: null` лише в літералах тестів і фікстур. Поведінку виправлять задачі 2–5.

- [ ] **Step 5: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/levels.test.ts`
  Expected: PASS.

- [ ] **Step 6: Commit** `feat(shared): 24d photo frames, nick fonts, gradient colours, 36 status emoji with free looks and level rewards`

---

### Задача 2. Сервер: колонки, міграція, збереження й рівні з шрифтом

**Files:**
- Modify: `apps/server/src/db/schema.ts:350-353`, `apps/server/src/xp-store.ts:286-379`, `apps/server/src/rooms/manager.ts:810-818`
- Create: `apps/server/drizzle/0031_profile_looks.sql` + `meta/0031_snapshot.json`, `_journal.json` (з `apps/server`: `pnpm exec drizzle-kit generate --name profile_looks`)
- Test: `apps/server/src/xp-store.test.ts`, `apps/server/src/profile-routes.test.ts`, `apps/server/src/rooms/manager.levels.test.ts`, `apps/server/src/lobby-routes.test.ts`

**Interfaces:**
- Consumes: `NickLooks`, `LooksInput`, `looksAllowed`, `looksShown`, `nextRewards`, `NickLevel` (задача 1).
- Produces:
  - `profile.photoFrame: text('photo_frame').$type<PhotoFrame>()`, `profile.nickFont: text('nick_font').$type<NickFont>()` (nullable).
  - `saveLooks(db, userId, looks: LooksInput): Promise<{ ok: true; looks: NickLooks } | { ok: false; error: 'look_locked' }>`: відсутні `photo`/`font` беруться зі збереженого (після `looksShown`).
  - `OwnLevel.next = nextRewards(progress.level)`; `ownLevel/publicLevel.looks` з п'ятьма полями.
  - `roomLevels` → `NickLevel` з `font`. `setLevels` копіює й порівнює `font`.
  - `PUT /api/me/looks` без змін контракту (400 / 409 `look_locked` / 200 `{ looks }`).

- [ ] **Step 1: Тести**
  - `xp-store.test.ts`:
    - `saveLooks keeps stored photo and font when an old client omits them`: зберегти `{ …, photo:'crimson', font:'hand' }`, потім `{ color:null, frame:null, badge:'🌻' }`. Результат `{ color:null, frame:null, badge:'🌻', photo:'crimson', font:'hand' }`.
    - `saveLooks refuses a locked photo frame`: рівень 1, `photo:'aura'` → `{ ok:false, error:'look_locked' }`, рядок профілю не змінився.
    - `roomLevels carries the shown font`: `nickFont:'pixel'` на рівні 16 → `font:'pixel'`. Те саме на рівні 15 → `font:null`.
    - `ownLevel.next at level 15`: рівні `[16,16,17,17,18,18]`.
  - `profile-routes.test.ts`: `PUT /api/me/looks` з `{ …, photo:'fire', font:'hand' }` на рівні 17 → 200 і обидва поля у відповіді. З `font:'comic'` → 400. З `photo:'aura'` → 409 `look_locked`.
  - `manager.levels.test.ts`: хелпер `lv` отримує параметр `font`. `setLevels` з іншим лише `font` викликає `changed`, з тим самим — не викликає. `levelsView` віддає `font`.
  - `lobby-routes.test.ts`: `host.level` містить `font` (`expect.objectContaining({ level: 1, font: null })`).

- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/server/src/xp-store.test.ts apps/server/src/profile-routes.test.ts apps/server/src/rooms/manager.levels.test.ts apps/server/src/lobby-routes.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Колонки й міграція**
  Додати два поля в `profile` (коментар «рамка фото й шрифт ніку (24d); закрите рівнем не показується»). Згенерувати міграцію. Expected SQL: два `ALTER TABLE "profile" ADD COLUMN … text;`, нічого більше.

- [ ] **Step 4: Реалізувати `looksOf`, `NO_LOOKS`, `saveLooks`, `ownLevel.next`, `roomLevels`, `setLevels`**

- [ ] **Step 5: Тести проходять, рушій не зачеплено**
  Run: те саме, що в Step 2, і `git diff --stat main -- packages/engine`.
  Expected: PASS; diff порожній.

- [ ] **Step 6: Commit** `feat(server): 24d photo_frame and nick_font columns, looks saved and checked by level, font in room levels`

---

### Задача 3. Веб: шрифти ніку (ліниво), градієнтні кольори, uk-рядки

**Files:**
- Modify: `apps/web/package.json` (8 залежностей з «Рішень», `^5.3.0`), `apps/web/src/screens/Nick.tsx`, `apps/web/src/styles.css` (блок «Нік з рівнем…» ~13906-13960), `apps/web/src/i18n.ts` (біля `color_rainbow`/`frame_rainbow` ~2700), `apps/web/src/i18n.test.ts:76-92`
- Create: `apps/web/src/nick-fonts.ts`, `apps/web/src/nick-fonts.test.ts`, `apps/web/src/nick-colors.test.ts`
- Test: `apps/web/src/screens/Nick.test.tsx`

**Interfaces:**
- Consumes: `NickFont`, `NICK_FONTS`, `NICK_COLORS`, `NickLevel.font` (задача 1).
- Produces:
  ```ts
  // nick-fonts.ts
  export const NICK_FONT_LOADERS: Record<NickFont, () => Promise<unknown>>; // () => import('@fontsource-variable/caveat') …, brush → import('@fontsource/amatic-sc/700.css')
  export function loadNickFont(font: NickFont): Promise<void>; // один import на шрифт (кеш Promise), збій ковтає (лишається запасний шрифт)
  export function useNickFont(font: NickFont | null): void;    // useEffect → loadNickFont
  // Nick.tsx
  export function nickNameClass(color: NickColor | null, font: NickFont | null): string; // 'nick-name' [+ ' nick-c-<c>'] [+ ' nick-font-<f>']
  ```
  - CSS: `.nick-font-<id>` для 8 шрифтів (`font-family: '<Family>', system-ui, sans-serif; font-size: calc(1em * var(--nick-font-scale, 1)); line-height: 1.2`, `--nick-font-scale`: pixel 0.8, heavy 0.88, mono 0.92, poster 1, round 0.95, elegant 1.1, hand 1.12, brush 1.2). Плюс `.nick-c-<id>` для 6 градієнтів (як `.nick-c-rainbow`: `background-clip: text`).
  - uk-ключі `ADDED_24D` (усі для 24d; задачі 4–5 лише вживають):
    - `lookPhoto` «Рамка фото», `lookNoPhoto` «Томое (звичайна)», `lookFont` «Шрифт ніку», `lookNoFont` «Звичайний», `lookPreview` «Так тебе бачать», `lookLocked` «🔒 {level}», `reward_photo` «Рамка фото: {name}», `reward_font` «Шрифт ніку: {name}»;
    - `photo_crimson` «Багряна», `photo_silver` «Срібна», `photo_ink` «Туш», `photo_gold` «Золота», `photo_cloud` «Хмаринки», `photo_crows` «Ворони», `photo_fire` «Вогонь», `photo_neon` «Неон», `photo_thorns` «Терни», `photo_eclipse` «Кривавий місяць», `photo_storm` «Блискавка», `photo_aura` «Сяйво»;
    - `font_hand` «Рукописний», `font_round` «Круглий», `font_mono` «Моноширинний», `font_poster` «Плакатний», `font_brush` «Пензлем», `font_pixel` «Піксельний», `font_elegant` «Каліграфічний», `font_heavy` «Грубий»;
    - `color_blood` «Кривавий», `color_flame` «Вогняний», `color_ice` «Крижаний», `color_venom` «Отрута», `color_amethyst` «Аметист», `color_moonsilver` «Місячне срібло».

    Змінений текст: `lookFrame` → «Рамка ніку» (у `CHANGED_LATER`).

- [ ] **Step 1: Тести**
  - `nick-fonts.test.ts`:
    - `loads each font once`: `vi.spyOn` на `NICK_FONT_LOADERS.pixel`; після двох `loadNickFont('pixel')` викликано 1 раз.
    - `a failed load resolves`: loader кидає → `loadNickFont` повертає resolve.
    - `main.tsx imports no nick font`: текст `main.tsx` (readFileSync, як у `theme.test.ts`) не містить жодного з 8 імен пакетів.
  - `nick-colors.test.ts`: для кожного з 13 `NICK_COLORS` у `styles.css` є правило `.nick-c-<id>`. Для кожного hex у правилі (колір або точки `linear-gradient`) `contrast(hex, tokenColor(tokens,'--surface')) >= 4.5`. Хелпери `rootTokens`, `tokenColor`, `contrast` імпортувати з `theme.test.ts`. Кожен з 8 `NICK_FONTS` має правило `.nick-font-<id>` з `font-family`, що закінчується на `system-ui, sans-serif`.
  - `Nick.test.tsx`:
    - `levels={{ Оля: { level: 3, color:'venom', frame:null, font:'pixel' } }}` → `.nick-name` має класи `nick-c-venom` і `nick-font-pixel`, а `NICK_FONT_LOADERS.pixel` викликано.
    - `font:null` → класу `nick-font-` немає, loader не викликано.
  - `i18n.test.ts`: `ADDED_24D` з переліком вище в умові `fresh.filter(…)`; `'lookFrame'` у `CHANGED_LATER`.

- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/nick-fonts.test.ts apps/web/src/nick-colors.test.ts apps/web/src/screens/Nick.test.tsx apps/web/src/i18n.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Встановити пакети**
  Run: `pnpm --filter @quiz/web add @fontsource-variable/caveat @fontsource-variable/comfortaa @fontsource-variable/fira-code @fontsource-variable/oswald @fontsource/amatic-sc @fontsource-variable/pixelify-sans @fontsource-variable/cormorant @fontsource/dela-gothic-one`

- [ ] **Step 4: Реалізувати `nick-fonts.ts`, `nickNameClass`, `useNickFont` у `Nick`, CSS, uk-тексти**
  Підібрати точки градієнтів так, щоб пройшов тест контрасту. Орієнтири: blood `#ff4d5a→#ff8a8a`, flame `#ff6a3d→#ffc93c`, ice `#7dd3fc→#e0f2fe`, venom `#4ade80→#bef264`, amethyst `#c084fc→#f0abfc`, moonsilver `#cbd5e1→#f8fafc`. Анімацій кольору немає.

- [ ] **Step 5: Тести проходять; шрифти в окремих файлах збірки**
  Run: тести зі Step 2, далі `pnpm --filter @quiz/web build` і `grep -l "Pixelify" apps/web/dist/assets/index-*.css`.
  Expected: PASS; grep нічого не знаходить: шрифтів немає в головному CSS, вони в окремих чанках.

- [ ] **Step 6: Commit** `feat(web): 24d nick fonts loaded on demand, six gradient nick colours, uk strings`

---

### Задача 4. Веб: рамки фото й шапка профілю

**Files:**
- Create: `apps/web/src/profile/AvatarFrame.tsx`, `apps/web/src/profile/AvatarFrame.test.tsx`, `apps/web/src/photo-frames.test.ts`
- Modify: `apps/web/src/motifs/Motifs.tsx` (експортувати шляхи `CROW_PATH`, `CLOUD_PATH`, `TOMOE_PATH`; у самих мотивах нічого не змінюється), `apps/web/src/profile/ProfileHeader.tsx:33-75`, `apps/web/src/pages/Profile.tsx:49-55`, `apps/web/src/pages/PublicProfile.tsx:83`, `apps/web/src/styles.css` (новий блок «Рамки фото (24d)» поряд із `.tomoe-ring` ~15341)
- Test: `apps/web/src/profile/ProfileHeader.test.tsx`

**Interfaces:**
- Consumes: `PhotoFrame`, `NickLooks` (задача 1); `nickNameClass`, `useNickFont` (задача 3).
- Produces:
  - `AvatarFrame({ frame, children }: { frame: PhotoFrame | null; children: ReactNode }): JSX.Element`. `null` → `<TomoeRing>{children}</TomoeRing>` (як зараз). Інакше `span.photo-frame.photo-frame-<id>` з `children` і декоративним `svg.photo-frame-art` (`aria-hidden`, `focusable="false"`) для `cloud` / `crows` / `eclipse` / `thorns` / `storm`. Решта рамок — лише CSS (`::before`/`::after`, `conic-gradient`, `box-shadow`). Зовнішній розмір той самий, що в `.tomoe-ring`, тож розкладка шапки не зсувається.
  - `ProfileHeader` props: `badge: string | null` замінити на `looks: NickLooks`. Аватар у `AvatarFrame frame={looks.photo}`. Нік у `h1` — `<span className={nickNameClass(looks.color, looks.font)} dir="auto">`. `ProfileLevelMark badge={looks.badge}`.

- [ ] **Step 1: Тести**
  - `AvatarFrame.test.tsx`: для `null` рендериться `.tomoe-ring`. Для кожного з 12 `PHOTO_FRAMES` є `.photo-frame-<id>`, дитина всередині, а будь-який `svg` має `aria-hidden="true"`.
  - `photo-frames.test.ts` (читає `styles.css`):
    - кожен `PHOTO_FRAMES` має правило `.photo-frame-<id>`;
    - кожне `animation`/`animation-name` у правилах `.photo-frame` стоїть усередині `@media (prefers-reduced-motion: no-preference)`;
    - є щонайменше одна анімація (`aura`).
  - `ProfileHeader.test.tsx`:
    - `looks={{ …, photo:'fire', font:'pixel', color:'blood', badge:'🌻' }}` → у шапці `.photo-frame-fire`, у `h1` `.nick-font-pixel.nick-c-blood`, видно `🌻`;
    - `photo:null` → `.tomoe-ring`.

- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/profile/AvatarFrame.test.tsx apps/web/src/photo-frames.test.ts apps/web/src/profile/ProfileHeader.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Реалізувати `AvatarFrame`, CSS 12 рамок, `ProfileHeader`, виклики в `Profile.tsx` і `PublicProfile.tsx` (`looks={profile.level.looks}`)**
  Кольори рамок — з палітри теми (`--accent` та інші наявні змінні, а для золота/срібла/неону — свої hex, як у `.nick-f-*`). RTL: позиції декору через `inset-inline-*`.

- [ ] **Step 4: Тести проходять (разом із наявними тестами профілю)**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/profile apps/web/src/pages apps/web/src/photo-frames.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(web): 24d twelve avatar frames in the profile header with the nick font and colour`

---

### Задача 5. Веб: сторінка «Вигляд» — сітка вибору з переглядом

**Files:**
- Modify: `apps/web/src/profile/LevelCard.tsx:8-23,131-219`, `apps/web/src/styles.css` (блок `.look-group`/`.look-option`)
- Test: `apps/web/src/profile/LevelCard.test.tsx`, `apps/web/src/pages/profile/subpages.test.tsx`

**Interfaces:**
- Consumes: `LOOK_IDS`, `lookLevel`, `LookSlot`, `NickLooks`, `OwnLevel` (задача 1); `nickNameClass`, `loadNickFont` (задача 3); `AvatarFrame` (задача 4).
- Produces:
  - `rewardText` обробляє `photo` (`reward_photo` + `photo_<id>`) і `font` (`reward_font` + `font_<id>`).
  - Ключі рядків «Відкрито»/«Далі»: `${row.level}-${index}`, бо на рівні тепер буває кілька рядків.

- [ ] **Step 1: Тести (`LevelCard.test.tsx`)**
  - `shows five radio groups in order`: доступні імена radiogroup дорівнюють `['Рамка фото','Шрифт ніку','Колір ніку','Рамка ніку','Значок']`.
  - `locked looks are disabled with their level`: рівень 16. Радіо «Сяйво» має `disabled` і текст «🔒 з рівня 30» (`lookLocked` з `levelFromLevel`). «Піксельний» доступний.
  - `free looks are open at level 1`: «Багряна», «Рукописний», «Кривавий», «🌻» доступні; «Срібло» (рамка ніку) — ні.
  - `preview follows the choice`: клік «Вогонь» (рамка фото) і «Піксельний» → у `[data-testid="look-preview"]` є `.photo-frame-fire` і `.nick-font-pixel`.
  - `save sends all five slots`: мок `saveLooks` викликано з `{ color, frame, badge, photo:'fire', font:'pixel' }`.
  - `opening the page loads every open font for the tiles`: `NICK_FONT_LOADERS.hand` і `.pixel` викликано на рівні 16, `.heavy` — ні.
  - `two rewards on one level render without key warnings` (`console.error` не викликано).

- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/profile/LevelCard.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Реалізувати**
  - Нагорі: `[data-testid="look-preview"]` з живим переглядом (`aria-live="polite"`, підпис `lookPreview`). Усередині `AvatarFrame` з аватаром (`Avatar size="large"`), нік через `Nick` з `levels` і значок.
  - Під переглядом: п'ять `role="radiogroup"` у порядку photo, font, color, frame, badge. У кожній групі «нічого» (`lookNoPhoto`/`lookNoFont`/`lookNoColor`/`lookNoFrame`/`lookNoBadge`) і всі `LOOK_IDS[slot]`. Закрите — `disabled` + `lookLocked`.
  - Плитка — `label.look-option` з нативним `input type="radio"` (видимий фокус), не менша за 44×44 px. Шрифт: нік у цьому шрифті. Рамка фото: малий перегляд 40 px у рамці. Колір і рамка ніку: нік. Емодзі: сітка `repeat(auto-fill, minmax(44px, 1fr))`.
  - Шрифти для плиток вантажити `loadNickFont` лише для відкритих.
  - Розкладка без бокового скролу на 320 px.
  - Секції «Відкрито»/«Далі» лишаються вище, з новими `rewardText`.

- [ ] **Step 4: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/profile apps/web/src/pages/profile`
  Expected: PASS.

- [ ] **Step 5: Commit** `feat(web): 24d «Вигляд» picker with live preview, locked tiles with their level`

---

### Задача 6. Переклади 24d у шести мовах

**Files:**
- Modify: `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Test: `apps/web/src/locales/*.test.ts`, `apps/web/src/i18n.test.ts`

**Interfaces:**
- Consumes: ключі `ADDED_24D` і змінений `lookFrame` (задача 3).

- [ ] **Step 1: Для кожної мови `pnpm l10n todo <lang>`**
  Expected: у списку ключі `ADDED_24D` і `lookFrame`.
- [ ] **Step 2: Переклад у файл у scratchpad, потім `pnpm l10n merge <lang> <файл>`**
  Назви стилів шрифтів перекладаються як стилі, а не як назви гарнітур. `lookLocked` зберігає `{level}`. ar — повні форми там, де просить `todo`.
- [ ] **Step 3: Перевірка**
  Run: `pnpm l10n check en`, і так само для pl, de, es, it, ar; далі `pnpm vitest run --maxWorkers=2 apps/web/src/locales apps/web/src/i18n.test.ts`
  Expected: check чисто для кожної мови; тести PASS.
- [ ] **Step 4: Commit** `feat(web): 24d looks strings in en pl de es it ar`

---

### Задача 7. e2e «part 24d» і знімки 375/320 у uk та ar

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it` після `part 24c`, функція `profileLooks24d()`, у стилі 24b/24c: `try { … } catch { await snapshot(); throw }`)

**Interfaces:**
- Consumes: усе вище; хелпери e2e `open`, `register`, `myId`, `shot`, `noSideScroll`, `join`, `POLL`, `htmlLang`; `db.insert(xpEntry)` (як у ~17656).

- [ ] **Step 1: Написати сценарій**
  Назва: `part 24d: profile looks — Оля at level 17 picks the «Вогонь» photo frame, the «Піксельний» font, «Отрута» and 🌻 on «Вигляд» with a live preview, a level-30 frame stays locked and the server refuses it, her profile header and public profile show the frame and font, the font reaches the host lobby and her phone with an ellipsis, a fresh page loads no nick font, and 375/320 px in uk and ar has no side scroll`.

  Кроки:
  1. Оля (375×812) і Петро (375×812) реєструються. Олі вставити `xp_entry` на `xpForLevel(17)` (7010).
  2. Петро на «/»: `performance.getEntriesByType('resource')` без `/caveat|comfortaa|fira-code|oswald|amatic|pixelify|cormorant|dela-gothic/i`, бо шрифти ліниві.
  3. Оля на `/profile/looks`: радіо «Сяйво» вимкнене, видно «з рівня 30». Обирає «Вогонь», «Піксельний», «Отрута», «🌻». У перегляді `.photo-frame-fire` і `.nick-font-pixel`. Тисне «Зберегти вигляд». Після перезавантаження вибір лишається.
  4. `olya.request.put('/api/me/looks', { …, photo:'aura' })` → 409.
  5. `/profile` Олі: `.profile-head .photo-frame-fire`; у `h1 .nick-font-pixel` `getComputedStyle().fontFamily` містить `Pixelify Sans`; `document.fonts.check('16px "Pixelify Sans Variable"')` через poll → true. Петро на публічному профілі Олі бачить те саме.
  6. Ведуча (1280×800) відкриває гру. Оля на 320×640 входить з довгим ніком «Олександра-Вікторія 24d з дуже довгим ніком». На пульті ведучої й на телефоні Олі `.nick-name.nick-font-pixel` має `text-overflow: ellipsis`, а `scrollWidth > clientWidth` означає обрізано, не розірвано. `noSideScroll(olya)` = true.
  7. Для `uk` і `ar` (`PUT /api/me/locale`), ширини 375 і 320: `/profile/looks` і `/profile` без бокового скролу. Для ar `htmlDir` = `rtl`. Знімки `shot(olya, 'p24d-looks-<lang>-<w>')` і `shot(olya, 'p24d-header-<lang>-<w>')`.
  8. Оля з `reducedMotion: 'reduce'` (окремий контекст) обирає «Сяйво», яке відкрито після доливу досвіду до 30-го рівня. У `.photo-frame-aura` обчислене `animation-name` для `::before` — `none`.

- [ ] **Step 2: Збірка й прогін**
  Run: `pnpm build`, далі `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24d"`
  Expected: PASS; у `shots/` 8 знімків `p24d-*`.

- [ ] **Step 3: Регресія сусідніх частин**
  Run: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 24c|part 15a|levels"`
  Expected: PASS.

- [ ] **Step 4: Переглянути знімки очима**
  Перевірити: рамка не зрізана, нік у пікселі читається, ar дзеркальний, плитки ≥ 44 px.

- [ ] **Step 5: Commit** `test(e2e): part 24d profile looks with frames, fonts and phone shots`
