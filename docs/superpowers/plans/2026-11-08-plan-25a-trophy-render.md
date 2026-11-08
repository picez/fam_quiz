# План 25a: рендер оформлення кубка — three.js, `decor`, точки кріплення, фото, написи, наліпки; чистий грааль і перенесення Ясиного призу

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** кубок з необов'язковим оформленням `trophy.decor` (фото, написи, наліпки) малюється одним компонентом на three.js однаково на всіх поверхнях, де сьогодні є 3D. Призи без `decor` виглядають як зараз. Грааль стає звичайною чистою формою, Ясин «Сімейний Ґрааль» переходить на `decor`, а запечена модель зникає.

**Spec:** `docs/superpowers/specs/2026-11-08-trophy-editor-design.md`. Обов'язкові розділи: «Що вирішив власник» (фото, написи, наліпки), «Обмеження», «Як це зроблено». Частина 25a, рядок 6 специфікації. Поза планом лишаються ефекти й анімації появи (25b), а також редактор, замки за рівнем і заміна `PrizeEditor` (25c). Поля `effect`, `appearance`, шрифти й наліпки вже є в схемі `decor`. Рендер 25a поля `effect` і `appearance` ігнорує.

**Архітектура:**
- **shared** (`packages/shared/src/decor.ts`): схема `trophyDecorSchema`, межі, переліки місць, таблиця `DECOR_SUPPORT` (які місця має кожна форма) і `shownDecor`. `prizeContentSchema` отримує необов'язкове `trophy.decor`. Сервер `updatePrize` зберігає наявне `decor`, якщо клієнт його не надіслав.
- **веб, чисті модулі без three** (тести в node/jsdom):
  - `trophy/anchors.ts` — точки кріплення кожної форми;
  - `trophy/decor-layout.ts` — розкладка фото, кадрування, рядки тексту, кольори металу, підсумок `decorSummary`;
  - `trophy/decor-canvas.ts` — малювання текстур на 2D-контексті (контекст передається параметром).
- **веб, рушій** `trophy/engine/*`: єдине місце, що імпортує `three`. Вантажиться ліниво через `trophy/loadEngine.ts`, як зараз `loadViewer`. Один спільний `WebGLRenderer` на всю сторінку. Кожен трофей — свій 2D-`<canvas>`, у який рушій копіює кадр (`drawImage`). Так 3 кубки на церемонії й 60 карток вітрини мають один WebGL-контекст. Малюються лише видимі трофеї, і лише коли щось змінилось або йде обертання.
- **моделі:** `build-trophies.mjs` будує чистий `grail.glb` за профілем запеченого. Запечений тимчасово перейменовується на `grail-family.glb` і показується лише граалю без `decor`. Останньою задачею його прибирають.
- **перенесення:** `apps/server/scripts/seed-prize.ts --update <prizeId> grail` завантажує 13 фото на сайт через тимчасовий акаунт (як `seed-demo`), записує `decor` і очищає `engraving`.

**Технології:** TypeScript, zod, three.js `~0.183.2` + `@types/three` `~0.183.1` (GLTFLoader, RoomEnvironment, PMREMGenerator), React 19 + Testing Library (jsdom), Drizzle + PGlite (тести), tsx-скрипти, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22** (`packages/engine/src/restore.ts`). `packages/engine` не змінюється. Призи живуть у `room.prizes` / `PlacedPrize` (через `placedPrizeSchema` → `prizeContentSchema`), а не в `GameState`. Якщо без підняття версії ніяк, зупинитися й спитати власника до пушу.
- Нові поля лише **необов'язкові**. Кожен наявний рядок `prize.content`, `prize_award.content` і знімок кімнати проходить нову схему без змін. `prizeContentSchema` і всі нові об'єкти — `.strict()`.
- Межі (специфікація): кільце ≤ **16** фото; самоцвіти ≤ **8**; медальйон, табличка, фон — **1** фото. Написів ≤ **4**: рим ≤ **80** символів, поясок ≤ **40**, табличка ≤ **40**, зворот ≤ **60**. Наліпок ≤ **6**.
- Фото — лише адреси `IMAGE_URL` (`/uploads/<16–64 [a-z0-9]>.(jpg|png|webp)`). Завантаження — наявний `/api/uploads` (≤ 2 МБ, jpeg/png/webp, 20/хв на акаунт).
- Призи без `decor` малюються як зараз: та сама форма, колір `MATERIAL_LOOK`, обертання, значок-емодзі без WebGL.
- Без WebGL, при збої чанка, збої моделі чи втраті контексту — значок-емодзі `.trophy-fallback`, як зараз. `prefers-reduced-motion: reduce` вимикає обертання.
- `three` імпортують лише файли `apps/web/src/trophy/engine/`. Вони потрапляють у бандл лише через динамічний `import()` у `trophy/loadEngine.ts`. Лобі, як і зараз, не вантажить ні моделей, ні чанка рушія.
- `grail.glb`/`grail-family.glb`: живий сайт не ламається між задачами (див. «Порядок викочування»). Сімейні фото з `D:\myfiles\cup1` ніколи не потрапляють у git, тести, e2e чи знімки в репозиторії.
- 25a не додає рядків інтерфейсу. Якщо рядок усе ж знадобиться: uk в `apps/web/src/i18n.ts`, ключ у новому `ADDED_25A` в `apps/web/src/i18n.test.ts`, переклади в 6 json (`pnpm l10n check <lang>` чисто). ru ніколи. Нічого, пов'язаного з росією. Кириличні літерали в `apps/web/src` лише в словниках і тестах (`source-scan.test.ts`).
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Prettier не запускати. e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<частина>"`, лише на передньому плані.
- Гілка `trophy-render` з `main`, кожна задача — коміт.

## Порядок викочування (живий сайт не ламається)

1. Задачі 1–11 у гілці, далі merge у `main` і push, тобто деплой. Після нього Ясин приз (грааль без `decor`) показує `grail-family.glb`, тобто рівно те, що зараз.
2. Задача 11, кроки 6–8 (вручну, після деплою): `seed-prize --update` проти проду. Відтоді Ясин приз — чистий `grail.glb` + `decor`.
3. Задача 12 (окремий коміт після перевірки): прибрати `grail-family.glb` і тимчасову гілку `modelUrl`, потім push.

## Review Focus

- Відкрита до деплою вкладка (старий `PrizeEditor`) зберігає Ясин приз: `PUT` без `trophy.decor` не стирає оформлення (задача 2, тест `old client omits decor`; задача 3, тест `keeps decor on save`).
- Фото з `decor` не вантажиться (видалене, 404, офлайн): кубок однаково з'являється, клітинка фото темна, без вічного значка й без винятку (задача 6, тест `a missing photo leaves its tile dark`; задача 8, тест `builds with a failed image`).
- Багато трофеїв разом (вітрина до 60 карток, церемонія 3): один WebGL-контекст. Невидимі не малюються. Втрата контексту повертає значки (задача 7, тести `one renderer for many views`, `offscreen views are not drawn`, `context loss falls back`; задача 10, крок 1.4).
- Форму оформленого призу змінили в старому редакторі (кубок з кільцем фото → зірка): кільця немає, рим не малюється, нічого не падає (задача 1, тест `shownDecor drops places the kind lacks`; задача 8, тест `star ignores ring and rim`).
- Шрифт напису не завантажився (офлайн, збій чанка, `document.fonts.load` висить): напис малюється запасним шрифтом не пізніше ніж за 3 с (задача 6, тести `a failed font resolves`, `a hanging font times out`).

## Рішення (там, де специфікація лишила місце будівельнику)

**Дані `decor`** (`packages/shared/src/decor.ts`):

```ts
export const TROPHY_PHOTO_PLACES = ['ring', 'medallion', 'gems', 'plaque', 'backdrop'] as const;
export const TROPHY_PHOTO_FRAMES = ['none', 'gold', 'round', 'rounded'] as const;   // не плутати з PHOTO_FRAMES профілю (24d)
export const TROPHY_PHOTO_STYLES = ['normal', 'bw', 'sepia'] as const;
export const INSCRIPTION_PLACES = ['rim', 'band', 'plaque', 'back'] as const;
export const INSCRIPTION_LOOKS = ['engraved', 'embossed', 'colored'] as const;
export const TROPHY_EFFECTS = ['glow', 'sparks', 'rays', 'fire', 'snow', 'none'] as const;
export const TROPHY_APPEARANCES = ['spin', 'rise', 'drop', 'flash'] as const;
export const STICKER_PLACES = ['front', 'back', 'left', 'right', 'base-left', 'base-right'] as const;
export const DECOR_LIMITS = { ring: 16, gems: 8, single: 1, inscriptions: 4, stickers: 6, rim: 80, band: 40, plaque: 40, back: 60 } as const;
export interface DecorPhoto { url: string; crop: { x: number; y: number; scale: number } } // x, y ∈ [0,1] — центр кадру; scale ∈ [1,4], 1 — «заповнити»
export interface Inscription { place: InscriptionPlace; text: string; font: NickFont | null; look: InscriptionLook; color: string } // color #rrggbb
export interface TrophyDecor {
  photos: DecorPhoto[]; photoPlace: TrophyPhotoPlace; frame: TrophyPhotoFrame; photoStyle: TrophyPhotoStyle;
  inscriptions: Inscription[]; effect: { kind: TrophyEffect; color?: string }; appearance: TrophyAppearance;
  stickers: { id: string; place: StickerPlace }[];
}
```

- `font: null` — «класичний» шрифт `Georgia, serif` (вага 600). Він нічого не вантажить і не закривається рівнем. Ним запечено Ясин напис, тож «так само, як зараз» інакше не вийде. Специфікація пише `font: NickFont`, і це єдине розширення.
- Текст напису: кожен рядок обрізано, пробіли стиснуто, `isStorable`. Табличка — до 2 рядків через `\n`, решта місць — 1 рядок. Довжина рахується з `\n`.
- Одне місце — один напис, одне місце — одна наліпка. `photoPlace: 'plaque'` з фото й напис `plaque` разом заборонені. `stickers[].id` має бути в `STICKERS`.
- Кількість фото обмежує `photoPlace`. `photos: []` дозволено, тоді `photoPlace` нічого не означає.
- `trophy.decor` у схемі — `.nullable().optional()`. Відсутнє в `PUT` означає «лишити збережене». `null` означає «прибрати оформлення». У базу `null` не пишеться: ключ просто зникає.

**Які місця має кожна форма** (`DECOR_SUPPORT`; редактор 25c пропонує лише їх, рендер решту мовчки пропускає):

| Форма | Фото | Написи | Наліпки |
|---|---|---|---|
| cup | ring, medallion, gems, plaque, backdrop | rim, band, plaque, back | усі 6 |
| medal | medallion, gems, backdrop | back | front, back, left, right |
| crown | ring, medallion, gems, plaque, backdrop | band, plaque | усі 6 |
| star | medallion, gems, plaque, backdrop | plaque, back | усі 6 |
| statuette | medallion, gems, plaque, backdrop | band, plaque | усі 6 |
| grail | ring, medallion, gems, plaque, backdrop | rim, band, plaque, back | усі 6 |

Фон (`backdrop`) малюється лише в розмірах `stage` і `view`.

**Грааль** (значення взято з `generate-glb.mjs`, яким пекли `grail.glb`; має виглядати так само):
- Профіль тіла `[r, y]`: `[0,0],[0.26,0],[0.27,0.03],[0.22,0.065],[0.09,0.10],[0.075,0.16],[0.11,0.23],[0.075,0.30],[0.09,0.36],[0.12,0.42],[0.26,0.52],[0.37,0.70],[0.405,0.95],[0.41,1.22],[0.435,1.44],[0.44,1.48],[0.40,1.45],[0.37,1.22],[0.35,0.95],[0.30,0.70],[0.18,0.52],[0,0.48]`, 120 сегментів. Чиста форма — лише тіло, без обідків.
- `ring`: стрічка `y 1.0`, висота `0.52`, радіуси `0.49` вгорі і `0.475` внизу. Відкритий циліндр, `n×8` сегментів. Обідки: тор `y 1.27 r 0.5`, тор `y 0.73 r 0.485`, товщина `0.028`.
- Атлас кільця: клітинка `150×204`, відступ `8`, тло `#20160c`, фото «заповнити» по центру. Матеріал: metalness `0`, roughness `0.6`. Клітинка `i` займає `u ∈ [i/n, (i+1)/n]`, як `CylinderGeometry` без повороту.
- `rim`: стрічка `y 1.37`, висота `0.16`, радіуси `0.463` і `0.455`, 220 сегментів. Обідки: `y 1.455` і `y 1.285`, `r 0.452`, товщина `0.012`. Текстура `2048×96`. Одиниця тексту: `text.toUpperCase() + '    ✦    '`, шрифт `600 54px Georgia, serif`, по горизонталі розтягнута на всю ширину (`scale(2048 / ширина·повтори, 1)`). Тло — градієнт `#e6c164 → #caa23f → #a07d2a`. Матеріал: metalness `1`, roughness `0.34`.
- `plaque`: площина `0.46×0.18` у `(0, 0.085, 0.235)`, `rotation.x = -0.32`. Текстура `1024×400`: заокруглена (r 42, поле 26) золота плашка `#f0cf72 → #cda53f → #9c7827`, обведення `14px #7c5e22` і `5px #f6e3a6`. Рядки по центру на `y = 0.37·H` і `0.66·H`, `600 108px`. Матеріал: metalness `0.9`, roughness `0.34`, прозорий.
- `engraved`: спершу тінь `rgba(255,246,214,0.55)` зі зсувом (+2, +2), для таблички (+2, +3), потім текст кольором `color`. `embossed`: світла `rgba(255,246,214,0.7)` (−1, −1), темна `rgba(0,0,0,0.45)` (+2, +2), потім текст. `colored`: лише текст.

**Ясин `decor`** (задача 11): 13 фото в порядку `readdirSync(dir).filter(картинки).sort()` (так їх брав запік), `crop {x:0.5,y:0.5,scale:1}`, `photoPlace 'ring'`, `frame 'none'`, `photoStyle 'normal'`. Написи:
- `{ place:'rim', text:"Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса", font:null, look:'engraved', color:'#3a2a0e' }`;
- `{ place:'plaque', text:'Хочеш я тобі Ді…\nҐрааль покажу?', font:null, look:'engraved', color:'#3a2a0e' }`.

Також `effect {kind:'none'}`, `appearance 'spin'`, `stickers []`, `engraving: null`, решта змісту без змін.

**Рушій:**
- Світло й кольори: `RoomEnvironment` через `PMREMGenerator` як `scene.environment` (без нього метал чорний), `NeutralToneMapping`, `SRGBColorSpace`. Під кубком м'яка кругла тінь (площина з радіальним градієнтом, прозорість 0.6, як `shadow-intensity`).
- Камера: перспективна, `fov 30°`. Відстань рахує `fitDistance(radius, fov, aspect)` за сферою, що обіймає модель і `decor`. Обертається група трофея навколо Y зі швидкістю `0.55 рад/с`. Тяг пальцем або мишею повертає yaw і pitch (pitch у межах ±0.35 рад). Стрілки ←/→ повертають на 15°. Масштабу немає.
- `devicePixelRatio` не більше 2. Видимість — `IntersectionObserver`. Цикл `requestAnimationFrame` іде, лише поки є видимий трофей, що обертається, тягнеться чи чекає перемальовування.
- Наліпки — перший кадр GIF/PNG як текстура на прозорій площині `0.12` по нормалі місця, зсув `0.004`, `polygonOffset`.
- Полотно трофея: `canvas.trophy-canvas`, `role="img"`, `aria-label` = `trophyLabel`. Для інтерактивного — `tabIndex 0`, CSS `touch-action: pan-y`, видимий `:focus-visible`. Атрибут `data-decor` = `decorSummary(kind, decor)`, щоб e2e бачив, що саме намальовано.

---

### Задача 1. shared: схема `decor`, межі, місця форм, `shownDecor`

**Files:**
- Create: `packages/shared/src/decor.ts`, `packages/shared/src/decor.test.ts`
- Modify: `packages/shared/src/prizes.ts:23-55` (тип `PrizeContent.trophy` і схема), `packages/shared/src/index.ts` (`export * from './decor'`)
- Test: `packages/shared/src/prizes.test.ts`

**Interfaces:**
- Produces: усе з «Рішень → Дані `decor`», а також:
  ```ts
  export const trophyDecorSchema: z.ZodType<TrophyDecor>;      // .strict(), refine-повідомлення нижче
  export const DECOR_SUPPORT: Record<TrophyKind, { photo: readonly TrophyPhotoPlace[]; inscription: readonly InscriptionPlace[]; sticker: readonly StickerPlace[] }>; // таблиця з «Рішень»
  export function shownDecor(kind: TrophyKind, decor: TrophyDecor): TrophyDecor; // місце фото не з DECOR_SUPPORT → photos []; написи й наліпки лише з підтримуваних місць
  // prizes.ts
  export type TrophyLook = { kind: TrophyKind; material: TrophyMaterial; decor?: TrophyDecor | null };
  export interface PrizeContent { …; trophy: TrophyLook | null; … }
  ```
  `decor.ts` бере `import type { TrophyKind }` з `prizes.ts` (лише тип, без циклу), `NICK_FONTS` з `levels.ts`, `stickerOf` з `stickers.ts`, `IMAGE_URL` з `quiz.ts`, `isStorable`/`UNSTORABLE` з `text.ts`.
  Повідомлення refine: `decor_too_many_photos`, `decor_place_twice`, `decor_plaque_twice`, `decor_unknown_sticker`.

- [ ] **Step 1: Тести `decor.test.ts`**
  - `accepts the family grail decor`: об'єкт Ясиного `decor` з «Рішень» з 13 адресами `/uploads/<32 hex>.jpg` проходить, і результат дорівнює входу.
  - `photo limits follow the place`: `ring` 16 → ok, 17 → `decor_too_many_photos`; `gems` 8 ok, 9 ні; `medallion`/`plaque`/`backdrop` 2 → ні; `photos: []` з будь-яким `photoPlace` → ok.
  - `inscription limits`: рим 80 символів ok, 81 ні; `band` 41 ні; `plaque` 40 ok; `back` 61 ні; 5 написів ні; два `rim` → `decor_place_twice`; `'a\nb'` на `plaque` ok, на `rim` ні; `'a\nb\nc'` на `plaque` ні; `'  Слава   Україні  '` → `'Слава Україні'`; `font: 'comic'` ні; `font: null` ok; `color: 'red'` ні, `'#3A2A0E'` ok.
  - `plaque is either a photo or text`: `photoPlace 'plaque'` з 1 фото й написом `plaque` → `decor_plaque_twice`; те саме з `photos: []` → ok.
  - `stickers`: 6 різних місць ok; 7 ні; два `front` → `decor_place_twice`; `id: 'nope'` → `decor_unknown_sticker`; перший `STICKERS[0].id` ok.
  - `crop range`: `x: -0.1`, `y: 1.1`, `scale: 0.9`, `scale: 4.1` → ні; `{0, 1, 4}` ok.
  - `effect and appearance are stored as given`: `effect {kind:'glow', color:'#ff0000'}` і `appearance 'drop'` проходять; `effect {kind:'lava'}` ні; зайвий ключ у будь-якому об'єкті → ні (strict).
  - `shownDecor drops places the kind lacks`: `star` + `ring` з 3 фото + написи `rim` і `plaque` + наліпки `front` і `base-left` → `photos: []`, написи лише `plaque`, наліпки обидві. `medal` + наліпка `base-left` → прибрана. `cup` → без змін.
  - `support table`: кожен `TROPHY_KINDS` має запис. Кожне місце з таблиці входить у свій перелік. `medal.photo` не містить `ring` і `plaque`.
- [ ] **Step 2: Тести `prizes.test.ts`**
  - `old content stays valid`: наявні фікстури без `decor` (кубок, медаль, грааль Ясі з `engraving`) проходять і не отримують ключа `decor`.
  - `trophy decor is optional, nullable and strict`: `trophy {kind, material, decor: <валідний>}` ok; `decor: null` ok; `decor: {}` ні; `trophy.extra` ні.
  - `placedPrizeSchema` з оформленим змістом проходить.
- [ ] **Step 3: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 packages/shared/src/decor.test.ts packages/shared/src/prizes.test.ts`
  Expected: FAIL (немає `decor.ts`).
- [ ] **Step 4: Реалізувати `decor.ts` і зміни `prizes.ts`**
  Текст напису — свій `inscriptionText(place)`: `split('\n')` → кожен рядок стиснути й обрізати → порожніх рядків немає → кількість рядків ≤ (plaque ? 2 : 1) → `join('\n')` → `1..DECOR_LIMITS[place]` → `isStorable`. Перевірки кількостей і унікальності — `superRefine` з повідомленнями вище.
- [ ] **Step 5: Типи монорепо**
  Run: `pnpm -r exec tsc --noEmit`
  Expected: чисто. `TrophyLook` у вебі (`trophy-meta.ts`) поки свій. Задача 3 переводить його на спільний.
- [ ] **Step 6: Тести проходять**
  Run: те саме, що в Step 3.
  Expected: PASS.
- [ ] **Step 7: Commit** `feat(shared): 25a trophy decor schema — photos, inscriptions, stickers, effect and appearance fields, per-kind places`

---

### Задача 2. Сервер: `decor` зберігається, старий клієнт його не стирає

**Files:**
- Modify: `apps/server/src/prizes.ts:53-91` (`createPrize`, `updatePrize`)
- Test: `apps/server/src/prizes.test.ts`, `apps/server/src/prize-routes.test.ts`, `apps/server/src/prizes.award.test.ts`

**Interfaces:**
- Consumes: `TrophyDecor`, `prizeContentSchema` з `decor` (задача 1).
- Produces: `function withDecor(next: PrizeContent, stored: PrizeContent | null): PrizeContent` (не експортується з пакета, лише модуль `prizes.ts`):
  - `next.trophy === null` → без змін;
  - `decor === undefined` і `stored?.trophy?.decor` є → беремо збережене (навіть при іншому `kind`);
  - `decor === null` → ключ прибрано.

  `createPrize` викликає `withDecor(content, null)`, `updatePrize` — `withDecor(content, row.content)`. Контракт маршрутів не змінюється.

- [ ] **Step 1: Тести**
  - `prizes.test.ts`:
    - `old client omits decor`: створити кубок з `decor` (2 фото на кільці, рим), потім `updatePrize` з `trophy {kind:'cup', material:'silver'}` без `decor` → у базі `material 'silver'` і той самий `decor`;
    - `decor null removes it`: `trophy.decor: null` → у збереженому змісті немає ключа `decor`;
    - `kind change keeps decor`: cup → star без `decor` → `decor` лишився;
    - `create drops a null decor`: `createPrize` з `decor: null` → без ключа.
  - `prize-routes.test.ts`:
    - `POST` з валідним `decor` → 201, `decor` у відповіді й у `GET /api/me/prizes`;
    - `POST` з 17 фото на кільці → 400 `invalid_payload`;
    - `POST` грааля з `decor` → 409 `trophy_unavailable` (замок лишається до 25c);
    - `PUT` Ясиного грааля (рядок вставлено напряму, `kind 'grail'`, з `decor`) з новою назвою без `decor` → 200, `decor` на місці.
  - `prizes.award.test.ts`: `awardPrizes` з оформленим призом → `prize_award.content.trophy.decor` дорівнює збереженому, `showcaseOf` віддає його в `awards[0].content.trophy.decor`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/server/src/prizes.test.ts apps/server/src/prize-routes.test.ts apps/server/src/prizes.award.test.ts`
  Expected: FAIL на `old client omits decor`, `decor null removes it`, `create drops a null decor`.
- [ ] **Step 3: Реалізувати `withDecor` і виклики**
- [ ] **Step 4: Тести проходять, рушій гри не зачеплено**
  Run: те саме, що в Step 2, і `git diff --stat main -- packages/engine`.
  Expected: PASS; diff порожній.
- [ ] **Step 5: Commit** `feat(server): 25a keep a prize's trophy decor when a client omits it; null removes it`

---

### Задача 3. Веб: `TrophyLook` зі спільного типу, `PrizeEditor` не губить `decor`

**Files:**
- Modify: `apps/web/src/trophy/trophy-meta.ts:23-26` (локальний `TrophyLook` → `export type { TrophyLook } from '@quiz/shared'`), `apps/web/src/prizes/PrizeEditor.tsx:33-52,104`
- Test: `apps/web/src/prizes/PrizeEditor.test.tsx`

**Interfaces:**
- Consumes: `TrophyLook` (задача 1).
- Produces: у `PrizeEditor` зміст `trophy: trophyOn ? { ...initial?.trophy, kind, material } : null`. Прев'ю — `TrophyView trophy={content.trophy}`, тобто з `decor`.

- [ ] **Step 1: Тести `PrizeEditor.test.tsx`**
  - `keeps decor on save`: `initial` — кубок з `decor`. Змінити назву й матеріал, «Зберегти» → `onSave` отримав `trophy.decor`, рівний початковому, і новий `material`.
  - `the preview gets the decor`: мок `TrophyView` (`vi.mock('../trophy/TrophyView')`) отримує `trophy.decor`.
  - Наявні тести (грааль лише для призу, що вже ним є) лишаються зеленими.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/prizes/PrizeEditor.test.tsx`
  Expected: FAIL на `keeps decor on save`.
- [ ] **Step 3: Реалізувати**
- [ ] **Step 4: Тести проходять**
  Run: те саме, що в Step 2, і `pnpm -r exec tsc --noEmit`.
  Expected: PASS; tsc чисто.
- [ ] **Step 5: Commit** `fix(web): 25a the prize form keeps the trophy decor and previews it`

---

### Задача 4. Моделі: чистий `grail.glb`, запечений тимчасово `grail-family.glb`, `modelUrl`

**Files:**
- Modify: `apps/web/scripts/build-trophies.mjs` (`grail()`, опція `smooth` у `lathe`, запис 6 файлів), `apps/web/public/models/CREDITS.txt`, `apps/web/src/trophy/trophy-meta.ts` (+ `modelUrl`), `apps/web/src/trophy/TrophyView.tsx:50` (`src` = `modelUrl(trophy)`)
- Rename: `git mv apps/web/public/models/grail.glb apps/web/public/models/grail-family.glb`, далі скрипт пише новий `grail.glb`
- Create: `apps/web/src/trophy/models.test.ts`
- Test: `apps/web/src/trophy/trophy-meta.test.ts`, `apps/web/src/trophy/TrophyView.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  /** Тимчасово (до задачі 12): грааль без decor — запечений сімейний. */
  export function modelUrl(trophy: TrophyLook): string; // grail && decor == null → '/models/grail-family.glb'; інакше `/models/${kind}.glb`
  ```
  `lathe(profile, segments, phase = 0, { smooth = false } = {})`: `smooth` усереднює нормалі сусідніх поясів у спільній точці профілю (як `LatheGeometry`). Наявні 5 моделей будуються без `smooth`, і їхні байти не змінюються.

- [ ] **Step 1: Тести**
  - `models.test.ts` (node, `readFileSync` як у `lazy.test.ts`; читає JSON-чанк GLB):
    - для кожного `TROPHY_KINDS` є `public/models/<kind>.glb`: один меш, один матеріал `metal` без `baseColorTexture`, `images` немає;
    - `grail.glb`: межі `POSITION` ≈ `min [-0.44, 0, -0.44]`, `max [0.44, 1.48, 0.44]` (±0.005), розмір ≤ 200 000 Б;
    - `grail-family.glb` є і має 3 `images` (тимчасовий; задача 12 перевертає цю перевірку);
    - `cup.glb`, `medal.glb`, `crown.glb`, `star.glb`, `statuette.glb` побайтно ті самі, що в `main` (sha256 записано в тесті).
  - `trophy-meta.test.ts`: `modelUrl({kind:'grail',material:'gold'})` = `'/models/grail-family.glb'`; з `decor: null` — те саме; з `decor` — `'/models/grail.glb'`; `cup` з `decor` і без — `'/models/cup.glb'`.
  - `TrophyView.test.tsx`: грааль без `decor` → `model-viewer[src="/models/grail-family.glb"]`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/models.test.ts apps/web/src/trophy/trophy-meta.test.ts apps/web/src/trophy/TrophyView.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: `git mv`, `grail()` за профілем з «Рішень» (`lathe(…, 120, 0, { smooth: true })`, лише тіло), записати й перевірити**
  Run: `node apps/web/scripts/build-trophies.mjs`
  Expected: шість рядків `<name>.glb <bytes> B`, `grail.glb` ≤ 200 000 Б. Якщо більше, зменшити до 96 сегментів. `git status` показує зміненими лише `grail.glb` (новий) і `grail-family.glb` (перейменування).
- [ ] **Step 4: `modelUrl`, виклик у `TrophyView`, CREDITS**
  У CREDITS шість згенерованих файлів (CC0), а `grail-family.glb` — окремий абзац, як нині про `grail.glb`, з приміткою «тимчасовий, прибирається після перенесення на decor».
- [ ] **Step 5: Тести проходять**
  Run: те саме, що в Step 2.
  Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): 25a plain grail geometry in build-trophies; the baked family model kept as grail-family.glb until the decor migration`

---

### Задача 5. Веб: точки кріплення й розкладка оформлення (чисті функції)

**Files:**
- Create: `apps/web/src/trophy/anchors.ts`, `apps/web/src/trophy/anchors.test.ts`, `apps/web/src/trophy/decor-layout.ts`, `apps/web/src/trophy/decor-layout.test.ts`

**Interfaces:**
- Consumes: `DECOR_SUPPORT`, `shownDecor`, типи `decor` (задача 1); `MATERIAL_LOOK` (`trophy-meta.ts`).
- Produces (без `three`, координати в просторі моделі, `Vec3 = readonly [number, number, number]`):
  ```ts
  // anchors.ts
  export interface Band { y: number; height: number; radiusTop: number; radiusBottom: number; segments: number; tori: readonly { y: number; radius: number; tube: number }[] }
  export interface Spot { position: Vec3; normal: Vec3; size: number }          // size — діаметр/ширина
  export interface Plate { position: Vec3; tiltX: number; width: number; height: number }
  export interface Circle { center: Vec3; axis: 'y' | 'z'; radius: number; size: number } // самоцвіти по колу
  export interface KindAnchors {
    ring?: Band; rim?: Band; band?: Band; medallion?: Spot; back?: Spot; gems?: Circle; plaque?: Plate;
    stickers: Partial<Record<StickerPlace, Spot>>;
  }
  export const TROPHY_ANCHORS: Record<TrophyKind, KindAnchors>;
  // decor-layout.ts
  export const RING_TILE = { width: 150, height: 204, pad: 8, background: '#20160c' } as const;
  export function ringAtlasSize(count: number): { width: number; height: number };   // 150·n × 204
  export function tileRect(index: number): { x: number; y: number; width: number; height: number }; // з відступом pad
  export function coverCrop(image: { width: number; height: number }, box: { width: number; height: number }, crop: DecorPhoto['crop']): { sx: number; sy: number; sw: number; sh: number };
  export function gemSpots(circle: Circle, count: number): { position: Vec3; normal: Vec3 }[]; // рівномірно, перший спереду (+Z для 'y'; угорі для 'z')
  export function rimUnit(text: string): string;                    // text.toUpperCase() + '    ✦    '
  export function rimRepeats(unitWidth: number, canvasWidth: number): number; // max(1, floor(canvasWidth / unitWidth))
  export function plaqueLines(text: string, measure: (line: string) => number, maxWidth: number): string[]; // ≤ 2
  export function fitFontPx(lines: string[], measure: (line: string, px: number) => number, box: { width: number; height: number }, maxPx: number): number;
  export function metalStops(material: TrophyMaterial, part: 'band' | 'plate'): readonly [string, string, string];
  export function fitDistance(radius: number, fovDeg: number, aspect: number): number;
  export function decorSummary(kind: TrophyKind, decor: TrophyDecor | null | undefined): string; // '' без decor
  ```

- [ ] **Step 1: Тести `anchors.test.ts`**
  - `anchors match the support table`: для кожної форми набір ключів `ring/rim/band/medallion/back/gems/plaque`, які є, дорівнює тим, що випливають з `DECOR_SUPPORT`:
    - фото `ring` → `ring`; `medallion` → `medallion`; `gems` → `gems`; фото або напис `plaque` → `plaque`;
    - напис `rim` → `rim`, `band` → `band`, `back` → `back`;
    - ключі `stickers` = `DECOR_SUPPORT[kind].sticker`.
  - `grail anchors are the baked ones`: `ring`, `rim`, `plaque` дорівнюють числам з «Рішень → Грааль», включно з торами й сегментами (`ring.segments` = 0 означає `n×8`; `rim.segments` = 220).
  - `normals are unit and spots sit on the model`: кожна нормаль має довжину 1 ± 1e-6. Кожна позиція лежить у межах `POSITION` моделі `<kind>.glb` (читати GLB як у `models.test.ts`), розширених на 0.08.
- [ ] **Step 2: Тести `decor-layout.test.ts`**
  - `ringAtlasSize(13)` = `{1950, 204}`; `tileRect(2)` = `{x: 308, y: 8, width: 134, height: 188}`.
  - `coverCrop` при `{0.5, 0.5, 1}` дорівнює математиці запіку (`s = max(iw/w, ih/h)`, по центру): фото 800×600 у 134×188 → `sw = 600·134/188`, `sh = 600`, `sx = (800 − sw)/2`, `sy = 0`. `scale 2` → удвічі менший `sw`/`sh` навколо того самого центру. `x 0` → `sx = 0`, кадр не виходить за край.
  - `gemSpots({center:[0,0.23,0], axis:'y', radius:0.11, size:0.05}, 4)` → 4 точки, перша `[0, 0.23, 0.11]` з нормаллю `[0,0,1]`, кути через 90°.
  - `rimUnit('ab')` = `'AB    ✦    '`; `rimRepeats(2500, 2048)` = 1; `rimRepeats(500, 2048)` = 4.
  - `plaqueLines`: `'Хочеш я тобі Ді…\nҐрааль покажу?'` → два рядки як є. `'Хочеш я тобі Ді… Ґрааль покажу?'` з `measure = s => s.length·10` і `maxWidth 200` → `['Хочеш я тобі Ді…', 'Ґрааль покажу?']` (розрив, де довший рядок найкоротший). Короткий текст, що вміщується, → один рядок.
  - `fitFontPx`: два рядки по 16 символів, `measure = (s, px) => s.length·px·0.5`, поле `972×348`, `max 108` → 108; двічі довший текст → менше за 108.
  - `metalStops('gold','band')` = `['#e6c164','#caa23f','#a07d2a']`; `('gold','plate')` = `['#f0cf72','#cda53f','#9c7827']`. Для `silver`, `bronze`, `diamond` — три hex-рядки зі спадною світлотою.
  - `fitDistance(1, 30, 1)` ≈ `1 / sin(15°) · 1.05` (±1e-6); при `aspect 0.5` відстань більша.
  - `decorSummary('cup', decor)` для кільця з 3 фото, написів `rim` і `plaque` та наліпок `front` і `back` = `'photos:ring:3;inscriptions:rim,plaque;stickers:front,back'`. Для `star` з тим самим decor (через `shownDecor`) = `'photos:none;inscriptions:plaque;stickers:front,back'`. Порожні `inscriptions`/`stickers` не пишуться: медаль з медальйоном і написом `back` без наліпок = `'photos:medallion:1;inscriptions:back'`. Без decor = `''`.
- [ ] **Step 3: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/anchors.test.ts apps/web/src/trophy/decor-layout.test.ts`
  Expected: FAIL.
- [ ] **Step 4: Реалізувати**
  Координати для cup, medal, crown, star, statuette підбирає будівельник за профілями в `build-trophies.mjs`:
  - cup: `ring` на чаші 0.66–0.94, `rim` на вінці 0.95–1.0, `band` на круглій ніжці 0.2–0.25, `plaque` на передній грані постаменту, `medallion` спереду чаші, `back` — дзеркально ззаду;
  - medal: `medallion` по центру диска перед зіркою, `back` на звороті диска, `gems` по колу диска (`axis 'z'`);
  - crown: `ring` на обручі 0.18–0.42, `band` на нижньому краї;
  - star: `medallion` у центрі зірки, `back` ззаду;
  - statuette: `medallion` на грудях, `band` на подолі.

  Грааль — лише числа з «Рішень». Значення, з яких мінімально видно, що вийшло, перевірити оком у задачі 9 (знімки).
- [ ] **Step 5: Тести проходять**
  Run: те саме, що в Step 3.
  Expected: PASS.
- [ ] **Step 6: Commit** `feat(web): 25a trophy anchors per kind and pure decor layout`

---

### Задача 6. Веб: текстури оформлення на 2D-полотні, шрифти написів

**Files:**
- Create: `apps/web/src/trophy/decor-canvas.ts`, `apps/web/src/trophy/decor-canvas.test.ts`
- Modify: `apps/web/src/nick-fonts.ts` (+ `NICK_FONT_FAMILY`)
- Test: `apps/web/src/nick-fonts.test.ts`

**Interfaces:**
- Consumes: усе з `decor-layout.ts` (задача 5); `loadNickFont` (24d).
- Produces (кожна `draw*` малює в переданий `ctx: CanvasRenderingContext2D` і нічого не створює сама; `image: CanvasImageSource & { width: number; height: number } | null`, `null` — фото не завантажилось):
  ```ts
  // nick-fonts.ts
  export const NICK_FONT_FAMILY: Record<NickFont, string>; // 'Caveat Variable', … — ті самі, що в styles.css
  // decor-canvas.ts
  export function inscriptionFont(font: NickFont | null, px: number): string; // null → `600 ${px}px Georgia, serif`; brush 700, heavy 400, решта 600; `'<Family>', Georgia, serif`
  export function loadInscriptionFont(font: NickFont | null): Promise<void>;   // loadNickFont + document.fonts.load, ≤ 3000 мс, ніколи не відхиляється
  export function toneImageData(data: Uint8ClampedArray, style: TrophyPhotoStyle): void; // bw: 0.299/0.587/0.114; sepia: стандартна матриця (0.393 0.769 0.189 / 0.349 0.686 0.168 / 0.272 0.534 0.131), обрізка до 255
  export function drawPhotoRing(ctx, images: (Img | null)[], decor: TrophyDecor, material: TrophyMaterial): void; // розмір ringAtlasSize(n)
  export function drawPhotoDisc(ctx, image: Img | null, photo: DecorPhoto, decor: TrophyDecor, px: number): void; // медальйон, самоцвіт: коло, ободок металу
  export function drawPhotoCard(ctx, image: Img | null, photo: DecorPhoto, decor: TrophyDecor, size: { width: number; height: number }): void; // табличка, фон
  export function drawRim(ctx, inscription: Inscription, material: TrophyMaterial): void;   // 2048×96
  export function drawBand(ctx, inscription: Inscription, material: TrophyMaterial): void;  // 1024×64, текст по центру ширини
  export function drawPlaque(ctx, inscription: Inscription, material: TrophyMaterial): void; // 1024×400
  export function drawBack(ctx, inscription: Inscription, material: TrophyMaterial): void;  // 512×512, коло, до 3 рядків автопереносом
  ```
  Рамки: `none` — темний відступ клітинки, як у запіку; `gold` — обведення 6 px `metalStops(material,'plate')`; `round` — коло з обведенням; `rounded` — заокруглений прямокутник r 18. Стиль фото: `getImageData` клітинки → `toneImageData` → `putImageData` (не `ctx.filter`: у Safari його немає).

- [ ] **Step 1: Тести** (фальшивий `ctx`: об'єкт, що записує виклики й присвоєння `font`/`fillStyle`; `measureText` повертає `{ width: text.length · px · 0.5 }`)
  - `nick-fonts.test.ts`: для кожного з 8 `NICK_FONTS` правило `.nick-font-<id>` у `styles.css` має `font-family: '<NICK_FONT_FAMILY[id]>'`.
  - `decor-canvas.test.ts`:
    - `the family rim is drawn as baked`: `drawRim(ctx, Ясин рим, 'gold')`:
      - перший `fillRect(0,0,2048,96)` з градієнтом, точки якого `metalStops('gold','band')`;
      - `font` = `'600 54px Georgia, serif'`;
      - `scale(2048 / measure(unit), 1)`, де `unit = rimUnit(text)`;
      - `fillText(unit, …)` двічі: спершу кольором `rgba(255,246,214,0.55)` зі зсувом, потім `#3a2a0e`.
    - `the family plaque has two lines`: `drawPlaque` для Ясиної таблички → `fillText` з `'Хочеш я тобі Ді…'` на `y = 148` і `'Ґрааль покажу?'` на `y = 264`, `textAlign 'center'`, обведення `#7c5e22` і `#f6e3a6`.
    - `looks`: `colored` → один `fillText` на рядок; `embossed` → три (світла, темна, текст).
    - `fonts`: `inscriptionFont('brush', 40)` = `"700 40px 'Amatic SC', Georgia, serif"`; `('heavy', 40)` починається з `'400 '`; `(null, 54)` = `'600 54px Georgia, serif'`.
    - `a failed font resolves`: `NICK_FONT_LOADERS.pixel` кидає → `loadInscriptionFont('pixel')` resolve.
    - `a hanging font times out`: `document.fonts.load` ніколи не повертається (fake timers) → resolve після `vi.advanceTimersByTime(3000)`.
    - `null font loads nothing`: жодного loader не викликано.
    - `a missing photo leaves its tile dark`: `drawPhotoRing` з `[img, null, img]` → `drawImage` двічі, а клітинка 1 лишається тлом `#20160c` (`fillRect` тла на весь атлас — перший виклик).
    - `ring uses the cover crop`: `drawImage(img, sx, sy, sw, sh, 8, 8, 134, 188)` для клітинки 0 з числами `coverCrop`.
    - `toneImageData`: `[255,0,0,255]` bw → `[76,76,76,255]`; sepia `[100,100,100,255]` → `[135,120,94,255]` (з округленням); `normal` нічого не змінює.
    - `round frame clips a circle`: `drawPhotoDisc` з `frame 'round'` викликає `arc`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/decor-canvas.test.ts apps/web/src/nick-fonts.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати `NICK_FONT_FAMILY` і `decor-canvas.ts`** за числами з «Рішень → Грааль»
- [ ] **Step 4: Тести проходять**
  Run: те саме, що в Step 2, і `pnpm vitest run --maxWorkers=2 apps/web/src/source-scan.test.ts`.
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25a decor textures — photo ring, discs, plaque and inscriptions in the nick fonts, photo styles and frames`

---

### Задача 7. Рушій three.js: лінивий чанк, спільний рендерер, модель і колір

**Files:**
- Modify: `apps/web/package.json` (`pnpm --filter @quiz/web add three@~0.183.2` і `add -D @types/three@~0.183.1`)
- Create:
  - `apps/web/src/trophy/engine-types.ts` (без `three`);
  - `apps/web/src/trophy/loadEngine.ts`;
  - `apps/web/src/trophy/engine/trophy-engine.ts`, `engine/stage.ts`, `engine/models.ts`;
  - тести `apps/web/src/trophy/engine/stage.test.ts`, `engine/models.test.ts`, `apps/web/src/trophy/loadEngine.test.ts`

**Interfaces:**
- Consumes: `modelUrl`, `MATERIAL_LOOK`, `trophyLabel` (задачі 3–4); `fitDistance`, `decorSummary` (задача 5).
- Produces:
  ```ts
  // engine-types.ts
  export type TrophySize = 'stage' | 'phone' | 'card' | 'view';
  export interface TrophyMount { look: TrophyLook; size: TrophySize; spin: boolean; interactive: boolean; label: string }
  export interface TrophyHandle { dispose(): void }
  export interface TrophyEngine { mount(host: HTMLElement, options: TrophyMount, events: { onReady(): void; onError(): void }): TrophyHandle }
  // loadEngine.ts — єдиний, хто знає шлях до рушія, і лише через import()
  export function loadTrophyEngine(): Promise<TrophyEngine | null>; // import('./engine/trophy-engine').then(m => m.engine), кеш, збій → null
  export function webglAvailable(): boolean;                         // перенесено з loadViewer.ts без змін
  // engine/stage.ts
  export interface StageView { canvas: HTMLCanvasElement; scene: Scene; camera: PerspectiveCamera; needsFrame(): boolean; onLost(): void }
  export class Stage { constructor(makeRenderer: () => WebGLRenderer); add(view: StageView): void; remove(view: StageView): void; invalidate(view: StageView): void; readonly environment: Texture }
  export function getStage(): Stage | null; // одна на сторінку; null — рендерер не створився чи контекст втрачено
  // engine/models.ts
  export function loadModel(url: string): Promise<Group>;    // GLTFLoader, кеш за url, кожному виклику — clone(true)
  export function paintModel(group: Group, material: TrophyMaterial): void; // меші без map → MeshStandardMaterial MATERIAL_LOOK; з map — як є
  // engine/trophy-engine.ts
  export const engine: TrophyEngine; // у цій задачі — лише модель без decor; decor додає задача 8
  ```
  `mount` створює в `host` `canvas.trophy-canvas` з атрибутами з «Рішень → Рушій», будує сцену (модель, тінь, камера за `fitDistance`), викликає `onReady` після першого скопійованого кадру. Збій моделі → `onError`. `dispose` прибирає полотно, слухачі й ресурси своєї сцени. Спільні текстури лишаються в кеші.

- [ ] **Step 1: Тести** (`three` працює в node без WebGL; рендерер — фальшивий об'єкт з `render`, `setSize`, `setPixelRatio`, `domElement`)
  - `engine/stage.test.ts` (jsdom; `requestAnimationFrame` і `IntersectionObserver` підмінено):
    - `one renderer for many views`: три `add` → фабрика рендерера викликана 1 раз; кадр малює всі три видимі (`render` ×3, `drawImage` у кожне 2D-полотно).
    - `offscreen views are not drawn`: вигляд, про який `IntersectionObserver` сказав `isIntersecting:false`, не малюється.
    - `the loop stops when idle`: усі `needsFrame() === false` і нічого не `invalidate` → після кадру новий `requestAnimationFrame` не ставиться. `invalidate` ставить рівно один.
    - `context loss falls back`: подія `webglcontextlost` на `domElement` → `onLost` кожного вигляду, `getStage()` далі `null`.
    - `pixel ratio is capped`: `devicePixelRatio 3` → `setPixelRatio(2)`.
  - `engine/models.test.ts` (node):
    - `paintModel tints plain metal and keeps textured`: група з мешем без `map` і мешем з `map` → перший має колір `#B0703A`, metalness 1, roughness 0.35 для `bronze`; другий той самий об'єкт матеріалу.
    - `loadModel clones`: два виклики з однією адресою → завантажувач викликано раз, групи різні.
  - `loadEngine.test.ts`: `import()` падає → `null`, і повторний виклик не вантажить знову. Успіх → той самий об'єкт двічі.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine apps/web/src/trophy/loadEngine.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Встановити пакети**
  Run: `pnpm --filter @quiz/web add three@~0.183.2` і `pnpm --filter @quiz/web add -D @types/three@~0.183.1`
  Expected: у `pnpm-lock.yaml` одна копія `three@0.183.2` (та сама, що тягне `model-viewer`).
- [ ] **Step 4: Реалізувати `engine-types.ts`, `loadEngine.ts`, `stage.ts`, `models.ts`, `trophy-engine.ts`**
  Імпорти аддонів: `three/addons/loaders/GLTFLoader.js`, `three/addons/environments/RoomEnvironment.js`. Кадр вигляду:
  1. `renderer.setSize(w·dpr, h·dpr, false)`;
  2. `render(scene, camera)`;
  3. `ctx.clearRect`, потім `ctx.drawImage(renderer.domElement, 0, 0)` у тому самому кадрі.

  Для інтерактивного полотна: `pointerdown/move/up` з `setPointerCapture`, `keydown` ←/→.
- [ ] **Step 5: Тести проходять; рушій — окремий чанк**
  Run: тести зі Step 2, далі `pnpm --filter @quiz/web build`.
  Expected: PASS; в `apps/web/dist/assets/` є `trophy-engine-*.js`. `grep -l "WebGLRenderer" apps/web/dist/assets/index-*.js` нічого не знаходить.
- [ ] **Step 6: Commit** `feat(web): 25a lazy three.js trophy engine — one shared renderer, per-view canvases, model and material`

---

### Задача 8. Рушій: оформлення на моделі — фото, написи, наліпки

**Files:**
- Create: `apps/web/src/trophy/engine/decor-meshes.ts`, `apps/web/src/trophy/engine/textures.ts`, `apps/web/src/trophy/engine/decor-meshes.test.ts`
- Modify: `apps/web/src/trophy/engine/trophy-engine.ts` (додати оформлення в сцену, `data-decor`)

**Interfaces:**
- Consumes: `TROPHY_ANCHORS` і розкладка (задача 5); `draw*`, `loadInscriptionFont` (задача 6); `Stage`, `paintModel` (задача 7); `shownDecor`, `stickerOf`, `stickerPath` (shared).
- Produces:
  ```ts
  // textures.ts — усе, що потребує DOM-полотна й картинок; у тестах підмінюється
  export interface DecorTextures {
    image(url: string): Promise<Img | null>;                   // кеш за url, збій → null
    canvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture; // CanvasTexture, SRGB
    sticker(id: string): Promise<Texture | null>;
  }
  export const domTextures: DecorTextures;
  // decor-meshes.ts
  export async function buildDecor(kind: TrophyKind, material: TrophyMaterial, decor: TrophyDecor, size: TrophySize, textures: DecorTextures): Promise<{ group: Group; backdrop: Texture | null }>;
  ```
  Імена мешів (на них спираються тести й e2e):
  - `decor-ring` + `decor-ring-torus` ×N;
  - `decor-rim` + `decor-rim-torus`;
  - `decor-band`, `decor-plaque`, `decor-back`;
  - `decor-medallion` (з ободком `decor-medallion-bezel`);
  - `decor-gem` ×n;
  - `decor-sticker-<place>`.

  Порожній ринг: відкритий `CylinderGeometry(radiusTop, radiusBottom, height, segments || n·8, 1, true)`, `rotation.y = 0`. Матеріали металевих частин фарбуються як база (`MATERIAL_LOOK`). Фон — `scene.background` лише для `stage`/`view`. Написи малюються після `loadInscriptionFont`.

- [ ] **Step 1: Тести `decor-meshes.test.ts`** (node; `DecorTextures` — заглушка з `new Texture()`, `image` повертає `{width:800,height:600}` або `null`)
  - `grail decor matches the bake`: `buildDecor('grail','gold', Ясин decor з 13 фото,'view', stub)`:
    - `decor-ring`: параметри геометрії `radiusTop .49`, `radiusBottom .475`, `height .52`, `radialSegments 104`, `openEnded true`; `position.y 1.0`; матеріал metalness 0, roughness 0.6;
    - два `decor-ring-torus`: `y 0.73` і `1.27`, радіуси `0.485`, `0.5`;
    - `decor-rim`: `.463/.455/.16`, 220 сегментів, `y 1.37`; два `decor-rim-torus` на `1.285`, `1.455`;
    - `decor-plaque`: площина `.46×.18`, `position (0,.085,.235)`, `rotation.x −0.32`, `transparent true`;
    - `canvas` викликано з `(1950, 204)`, `(2048, 96)`, `(1024, 400)`.
  - `star ignores ring and rim`: те саме decor на `star` → немає `decor-ring`, `decor-rim`; є `decor-plaque`.
  - `builds with a failed image`: `image` повертає `null` для одного url → `buildDecor` виконується, `decor-ring` є.
  - `backdrop only in big sizes`: `photoPlace 'backdrop'` → `backdrop !== null` для `view` і `stage`, `null` для `card` і `phone`.
  - `gems follow the anchor`: `cup` + `gems` з 5 фото → 5 `decor-gem`, позиції = `gemSpots(TROPHY_ANCHORS.cup.gems, 5)`.
  - `stickers sit on their spots`: наліпки `front` і `base-right` на `cup` → два меші з позиціями місць + нормаль·0.004. Невідомий `sticker()` → `null`, і меша немає, без винятку.
  - `effect and appearance are ignored`: `effect {kind:'fire'}`, `appearance 'drop'` → у групі ті самі меші, що й з `none`/`spin`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/decor-meshes.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати `textures.ts`, `decor-meshes.ts`; підключити в `trophy-engine.ts`**
  Під'єднання: `const shown = shownDecor(kind, decor)`, `buildDecor`, додати групу до групи трофея, `canvas.dataset.decor = decorSummary(kind, decor)`, камера за сферою моделі разом з оформленням, `onReady` після першого кадру з оформленням.
- [ ] **Step 4: Тести проходять**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25a decor on the trophy — photo ring, medallion, gems, plaque, backdrop, inscriptions and stickers at each kind's anchors`

---

### Задача 9. Перемикання: `TrophyView` на рушій на всіх поверхнях, `model-viewer` прибрано

**Files:**
- Modify:
  - `apps/web/src/trophy/TrophyView.tsx` (повністю);
  - `apps/web/src/trophy/PrizeViewer.tsx:22-23` (`FOCUSABLE` без `model-viewer`);
  - `apps/web/src/styles.css:13715-13775` (`.trophy-model` → `.trophy-canvas`, `touch-action: pan-y`, `:focus-visible`);
  - `apps/web/package.json` (прибрати `@google/model-viewer`);
  - `apps/web/src/trophy/lazy.test.ts` (повністю);
  - `apps/server/e2e/full-game.e2e.ts:17233-17234` (`isTrophyRequest`).
- Delete: `apps/web/src/trophy/loadViewer.ts`
- Test: `apps/web/src/trophy/TrophyView.test.tsx` (переписати), `Ceremony.test.tsx`, `PrizeViewer.test.tsx`, `apps/web/src/screens/MyPrize.test.tsx`, `apps/web/src/profile/Showcase.test.tsx`, `apps/web/src/prizes/PrizeEditor.test.tsx`

**Interfaces:**
- Consumes: `loadTrophyEngine`, `webglAvailable`, `TrophyEngine`, `TrophyMount` (задача 7).
- Produces: `TrophyViewProps` без змін (`trophy: TrophyLook`, `size`, `spin`, `interactive`). Поверхні (`Ceremony`, `PrizeViewer`, `MyPrize`, `Showcase`, `PrizeEditor`) не змінюються, бо вже передають `content.trophy` з `decor`. `isTrophyRequest = url => /\.glb(\?|$)/.test(url) || /\/assets\/(trophy-engine|three)[^/]*\.js/.test(url)`.

- [ ] **Step 1: Знімки «до» з чистого `main`** (окремий `git worktree add <scratchpad>/main-before main`, там `pnpm install`)
  Run: у тому worktree `pnpm build`, далі `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 14a|part 23a"`, скопіювати `shots/p14a-*`, `shots/p23a-*` у scratchpad `before/`.
  Expected: PASS. У журналі `p14a: stage trophy — cup.glb requested (3D)`. Якщо там `emoji fallback`, додати до `chromium.launch` `args: ['--enable-unsafe-swiftshader']` і повторити (ця зміна йде в коміт задачі).
- [ ] **Step 2: Тести `TrophyView.test.tsx`** (мок `./loadEngine`: `webglAvailable`, `loadTrophyEngine` → фальшивий рушій, чий `mount` записує `options` і повертає `{ dispose: vi.fn() }`)
  - Без WebGL — значок у кольорі матеріалу з `aria-label` «Золотий кубок», рушій не вантажиться (як зараз).
  - Рушій `null` — значок лишається.
  - `mounts with the full look`: `trophy` з `decor` → `mount(holder, { look: trophy, size:'stage', spin:true, interactive:true, label:'Срібна медаль' })`.
  - `keeps the emoji until ready and brings it back on error`: до `onReady` є `.trophy-fallback`, після нього немає, `onError` повертає.
  - `reduced motion`: `matchMedia` reduce → `spin:false`.
  - `remounts on change, disposes on unmount`: інший `material` → старий `dispose`, новий `mount`. `unmount` → `dispose`.
  - `PrizeViewer.test.tsx`: Tab ходить колом і по `canvas.trophy-canvas[tabindex="0"]` (фальшивий `mount` додає такий у `host`).
- [ ] **Step 3: Тест `lazy.test.ts` (переписати)**
  - `three stays lazy`:
    - `three` (`from 'three'`, `'three/addons/…'`) згадують лише файли `trophy/engine/`;
    - `trophy/engine/` статично імпортують лише інші файли `trophy/engine/` і тести;
    - `loadEngine.ts` має лише `import('./engine/trophy-engine')`;
    - `@google/model-viewer` не згадує жоден файл, і його немає в `apps/web/package.json`.
  - `pure decor modules do not import three`: `anchors.ts`, `decor-layout.ts`, `decor-canvas.ts`, `engine-types.ts`, `loadEngine.ts` без `three`.
- [ ] **Step 4: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/screens/MyPrize.test.tsx apps/web/src/profile/Showcase.test.tsx apps/web/src/prizes/PrizeEditor.test.tsx`
  Expected: FAIL.
- [ ] **Step 5: Реалізувати `TrophyView`, CSS, `FOCUSABLE`; прибрати `loadViewer.ts` і `@google/model-viewer`**
  Run: `pnpm --filter @quiz/web remove @google/model-viewer`
  Expected: `three` лишився у `dependencies`.
- [ ] **Step 6: Тести, типи, збірка**
  Run: тести зі Step 4, `pnpm -r exec tsc --noEmit`, `pnpm --filter @quiz/web build`.
  Expected: PASS; чисто; у `dist/assets` немає `model-viewer-*.js`.
- [ ] **Step 7: Знімки «після» і порівняння оком**
  Run: `pnpm build`, далі `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 14a|part 23a"`.
  Expected: PASS. Кожен `p14a-*`/`p23a-*` поруч із «до»: та сама форма, колір, розмір у кадрі (±10 %), тінь під кубком, значок без WebGL. Розбіжності в кадруванні виправити в `fitDistance`/`fov`, не в тестах.
- [ ] **Step 8: Commit** `feat(web): 25a every trophy surface draws through the three.js engine; model-viewer removed`

---

### Задача 10. e2e «part 25a»: оформлений кубок однаковий скрізь

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it` після останньої частини, функція `trophyDecor25a()`, стиль `try { … } catch { await snapshot(); throw }`)

**Interfaces:**
- Consumes: усе вище; хелпери e2e частини 14a (призи, місця, гра до фіналу), `register`, `shot`, `POLL`, `db.insert`. Очікувані `data-decor` — літерали в тесті (формат `decorSummary`, задача 5), без імпорту вебмодулів.

- [ ] **Step 1: Написати сценарій**
  Назва: `part 25a: trophy decor — Оля's cup with three photos on the ring, a rim in the hand font, a two-line plaque and two stickers, a medal with a medallion photo and an engraved back, and a plain silver star show the same decor on the stage ceremony, Петро's phone, the prize viewer and Петро's showcase, with one WebGL context for three trophies, still under reduced motion, the emoji without WebGL, and no 3D in the lobby`.
  1. Оля завантажує через `/api/uploads` три PNG, згенеровані в тесті (суцільні кольори 400×300 з `page.evaluate` + `canvas.toBlob`; жодних фото з диска). Створює через `POST /api/me/prizes`:
     - кубок: кільце з 3 фото; рим `font 'hand'`; табличка `'Перше місце\nЧемпіон'`; наліпки `STICKERS[0]` на `front` і `STICKERS[1]` на `base-left`;
     - медаль: медальйон з 1 фото; `back` `'Дякуємо за гру'` `embossed`;
     - срібну зірку без `decor`.
  2. Вона ж ведуча (1280×720): місця 1, 2, 3 = кубок, медаль, зірка. Лобі: `isTrophyRequest` порожній (як у 14a).
  3. Петро (акаунт, 375×812), Іра й Богдан (гості) грають так, щоб Петро був першим. На фіналі сцена показує церемонію з трьома трофеями.
  4. Сцена (до `addInitScript`): лічильник `HTMLCanvasElement.prototype.getContext` для `webgl`/`webgl2`. Після церемонії ≤ 2 (перевірка `webglAvailable` + рушій). `.trophy-fallback` на сцені зник (poll), кожен `canvas.trophy-canvas` має непрозорі пікселі в центрі (`getImageData` 2D-полотна). `data-decor` кубка = `'photos:ring:3;inscriptions:rim,plaque;stickers:front,base-left'`, медалі = `'photos:medallion:1;inscriptions:back'`, зірки = `''`.
  5. Телефон Петра («Мій приз»), перегляд призу (кнопка «Кубок») і публічна вітрина Петра для Олі показують кубок з тим самим `data-decor`.
  6. Окремий контекст з `reducedMotion: 'reduce'`, вітрина Петра: два `toDataURL` полотна кубка з різницею 1 с однакові.
  7. Окремий контекст, де `addInitScript` повертає `null` для `webgl`/`webgl2`: вітрина Петра показує 🏆, запитів `isTrophyRequest` немає.
  8. Знімки: `p25a-stage-ceremony`, `p25a-phone-myprize`, `p25a-viewer`, `p25a-showcase`.
- [ ] **Step 2: Збірка й прогін**
  Run: `pnpm build`, далі `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25a"`
  Expected: PASS; 4 знімки `p25a-*`.
- [ ] **Step 3: Регресія сусідніх частин**
  Run: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 14a|part 23a|part 21a"`
  Expected: PASS.
- [ ] **Step 4: Переглянути знімки очима**
  Фото на кільці в порядку 1-2-3. Рим читається рукописним шрифтом. Табличка у 2 рядки. Наліпки не тонуть у кубку. Медальйон круглий з ободком.
- [ ] **Step 5: Commit** `test(e2e): part 25a decorated trophies look the same on every surface with one WebGL context`

---

### Задача 11. Перенесення Ясиного «Ґрааля» на `decor` (скрипт, репетиція, прод)

**Files:**
- Create: `apps/server/scripts/site-uploads.ts`, `apps/server/scripts/grail-prize.ts`, `apps/server/scripts/grail-prize.test.ts`
- Modify: `apps/server/scripts/seed-demo.ts:111-158` (`uploadImages` переїжджає в `site-uploads.ts` без змін поведінки, `seed-demo` його імпортує), `apps/server/scripts/seed-prize.ts` (повністю)

**Interfaces:**
- Consumes: `trophyDecorSchema`, `prizeContentSchema`, `TrophyDecor` (задача 1); `createPrize`, `updatePrize` (задача 2).
- Produces:
  ```ts
  // site-uploads.ts
  export async function uploadImages(site: string, db: Db, keys: readonly string[], sources: () => Promise<Record<string, string>>): Promise<Record<string, string>>; // як було; 'file:<шлях>' — тип за розширенням (.jpg/.jpeg → image/jpeg, .png, .webp)
  export function localPhotos(dir: string): string[]; // readdirSync(dir).filter(/\.(jpe?g|png|webp)$/i).sort() → повні шляхи
  // grail-prize.ts
  export const GRAIL_RIM: string;     // «Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса»
  export const GRAIL_PLAQUE: string;  // «Хочеш я тобі Ді…\nҐрааль покажу?»
  export function grailDecor(urls: string[]): TrophyDecor;                        // 1..16 адрес, інакше виняток
  export function grailContent(previous: PrizeContent, urls: string[]): PrizeContent; // name/real/title/diploma з previous, engraving null, trophy {kind:'grail', material: previous.trophy?.material ?? 'gold', decor}
  ```
  `seed-prize.ts`:
  - `DATABASE_URL=… SITE_URL=… GRAIL_PHOTOS=<тека> tsx scripts/seed-prize.ts <email> grail` — створити;
  - `… --update <prizeId> grail` — перенести.

  Обидва режими завантажують фото з `GRAIL_PHOTOS` у порядку `localPhotos` і друкують цей порядок. `--update` відмовляє з поясненням, якщо:
  - рядка немає;
  - `status !== 'free'` (у грі — його знімок у кімнаті без `decor`);
  - `kind !== 'grail'`;
  - `decor` уже є.

  Перед записом друкує й зупиняється з помилкою, якщо в `prize` чи `prize_award` є інший грааль (крім цього id). Пише через `updatePrize(db, row.ownerId, id, content)` (вид не змінюється, тож замок не заважає). Наприкінці друкує `content` і адреси.

- [ ] **Step 1: Тести `grail-prize.test.ts`**
  - `the family decor`: `grailDecor` з 13 адресами `/uploads/<32 hex>.jpg` проходить `trophyDecorSchema` і дорівнює Ясиному `decor` з «Рішень» (порядок адрес збережено).
  - `content`: `grailContent(Ясин нинішній зміст, urls)` проходить `prizeContentSchema`, `engraving === null`, `name 'Сімейний Ґрааль'`, `diploma false`, `trophy.material 'gold'`.
  - `limits`: 0 і 17 адрес кидають виняток.
  - `localPhotos` (тимчасова тека в `os.tmpdir()` з `b.jpg`, `A.png`, `notes.txt`, `c.webp`) → `['A.png', 'b.jpg', 'c.webp']` повними шляхами.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/server/scripts/grail-prize.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати `site-uploads.ts`, `grail-prize.ts`, `seed-prize.ts`; `seed-demo.ts` імпортує `uploadImages`**
  Run: `pnpm vitest run --maxWorkers=2 apps/server/scripts` і `pnpm -r exec tsc --noEmit`.
  Expected: PASS; чисто.
- [ ] **Step 4: Репетиція локально (без проду, фото лише з `D:\myfiles\cup1`, нічого з них не комітиться)**
  1. Локальний сервер + база, локальний акаунт.
  2. У scratchpad tsx-сніпет кладе через `createPrize` Ясин нинішній зміст без `decor`.
  3. «Мої призи» → редагувати → знімок прев'ю (`grail-family.glb`) у scratchpad `grail-before.png`.
  4. `SITE_URL=http://localhost:<port> GRAIL_PHOTOS=D:\myfiles\cup1 … seed-prize.ts --update <id> grail`.
  5. Знімок прев'ю → `grail-after.png`.

  Expected: скрипт друкує 13 файлів у порядку `Screenshot_1.jpg, Screenshot_70.jpg, зображення_viber_…` і `updated`. На «після» ті самі фото в тому ж порядку по колу, рим і табличка тим самим шрифтом. Повторний `--update` відмовляє «already has decor». Знімки показати власнику.
- [ ] **Step 5: Commit** `feat(server): 25a seed-prize --update moves the family grail to trophy decor (photos uploaded to the site, rim and plaque as inscriptions, engraving cleared)`
- [ ] **Step 6: Merge задач 1–11 у `main` і push; дочекатися деплою**
  Перевірка: `curl -sI <SITE_URL>/models/grail-family.glb` → 200. Головна сторінка вантажить новий `index-*.js`.
- [ ] **Step 7: Прод (вручну)**
  Run: `DATABASE_URL=<prod> SITE_URL=<prod site> GRAIL_PHOTOS=D:\myfiles\cup1 pnpm --filter @quiz/server exec tsx scripts/seed-prize.ts --update 064b39f1-835e-47d9-bd2e-ce090e9805b7 grail`
  Expected: 13 завантажень, «no other grail», `updated`. Якщо приз у грі (`status reserved`), скрипт відмовить. Тоді чекати кінця гри й повторити.
- [ ] **Step 8: Перевірка проду**
  Прочитати рядок: `trophy.decor.photos.length === 13`, `engraving === null`. Кожна адреса `GET <SITE_URL>/uploads/…` → 200 `image/jpeg`. Записати в журнал сесії, що задача 12 тепер дозволена.

---

### Задача 12. Прибрати запечений грааль

**Files:**
- Delete: `apps/web/public/models/grail-family.glb`
- Modify: `apps/web/src/trophy/trophy-meta.ts` (`modelUrl` → завжди `/models/${kind}.glb`), `apps/web/public/models/CREDITS.txt` (абзац про `grail-family.glb` прибрати, шість файлів CC0), `apps/web/src/trophy/models.test.ts`, `apps/web/src/trophy/trophy-meta.test.ts`

**Interfaces:**
- Consumes: задача 11, крок 8 виконано.

- [ ] **Step 1: Тести**
  - `models.test.ts`: `grail-family.glb` немає; жоден файл у `public/models` не має `images`.
  - `trophy-meta.test.ts`: `modelUrl({kind:'grail',material:'gold'})` = `'/models/grail.glb'` з `decor` і без.
  - Пошук: `grep -rn "grail-family" apps packages docs/superpowers/plans --include=*.ts --include=*.tsx --include=*.mjs --include=*.txt` → лише цей план.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy`
  Expected: FAIL.
- [ ] **Step 3: Прибрати файл і гілку `modelUrl`, оновити CREDITS**
- [ ] **Step 4: Тести й e2e проходять**
  Run: тести зі Step 2, `pnpm build`, `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25a|part 14a"`.
  Expected: PASS.
- [ ] **Step 5: Commit, merge, push** `chore(web): 25a remove the baked family grail model — the grail is plain geometry plus decor`
