# Частина 25d — оформлення лягає на поверхню, без накладань, нова вибірка наліпок

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** фото, написи й наліпки на кубках лежать на справжній поверхні моделі, нічого не накладається (зайняте місце — переїзд на найближче вільне, однаково в редакторі, на церемонії й у вітрині), поясок кубка лягає на передню грань квадратної основи, а наліпки додаються через «+ Додати наліпку» → вікно наліпок → вибір вільного місця.

**Архітектура:** чиста розкладка `trophy/decor-places.ts` (без three) за `(kind, decor)` вирішує, де фактично лежить кожна частина; рушій (`trophy/engine`) малює вигнуті смуги як лате-смугу з профілю форми з відступом по нормалі, а плями (медальйон, зворот, самоцвіти, наліпки) — як декалі, спроєктовані на геометрію завантаженої `.glb`; таблички й поясок на грані — плоскі пластини на грані. Схема `decor` не змінюється: розкладка рахується з наявних даних щоразу.

**Технології:** React 19, Vite, three ~0.183 (лише в `apps/web/src/trophy/engine`, ліниво), vitest, e2e через `apps/server/e2e`.

**Специфікація:** `docs/superpowers/specs/2026-11-09-trophy-decals-and-shapes-design.md` (лише розділ 25d). Тло: `docs/superpowers/specs/2026-11-08-trophy-editor-design.md`, плани 25a–25c у `docs/superpowers/plans/`.

## Глобальні обмеження

- `GAME_STATE_VERSION` лишається 22; `packages/engine` не чіпаємо.
- Схема `trophyDecorSchema` у `packages/shared/src/decor.ts` не змінюється; наявні рядки `prize` / `prize_award` валідні й малюються на тих самих місцях (переїжджає лише те, що вже накладалось).
- Вручений сімейний грааль без decor (`/models/grail-family.glb`, `modelUrl`) малюється як був: для нього `buildDecor` не викликається.
- `three` і `three/addons/*` імпортуються лише в `apps/web/src/trophy/engine/` (перевіряє `apps/web/src/trophy/lazy.test.ts`); нові чисті модулі додати до списку «pure decor modules do not import three».
- Один спільний рендерер (`stage.ts`), спільні полотна з лічильником посилань (25c); без WebGL — значок; `prefers-reduced-motion` — без змін.
- Нові рядки інтерфейсу: uk в `apps/web/src/i18n.ts`, список `ADDED_25D` у `apps/web/src/i18n.test.ts` (і в фільтр `fresh.filter(...)`), переклади в 6 json (en, pl, de, es, it, ar); ru — ніколи; нічого про росію; кирилиця лише в словниках і тестах.
- CSS — логічні властивості (RTL), палітра Blood Moon, цілі дотику ≥ 44 px.
- Сімейні фото ніколи в git, тестах чи e2e (у e2e — лише намальовані в сторінці PNG, як `drawnPngs25c`).
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`; prettier не запускати.
- e2e: спершу `pnpm build`, потім у передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25d"`, кожен виклик < 10 хв.
- Гілка: працювати в окремій гілці від `main` (`plan-25d`); код трофеїв на `plan-26c` дорівнює `main`.

## Рішення

1. **Вигнуті смуги (кільце фото, рим, круглий поясок) — смуга з профілю.** У `anchors.ts` кожна форма тіла обертання отримує `profile` — зовнішні точки лате `[r, y]` знизу вгору, скопійовані з `apps/web/scripts/build-trophies.mjs`, і `segments` лате моделі. Смуга — `LatheGeometry` з 17 рядів, рівномірно по y між `y0` і `y1`; кожна точка зсунута по нормалі профілю на `BAND_LIFT = 0.003`; сегментів по колу `profile.segments × 3`, `phiStart = 0` (вершини моделі збігаються з кожною третьою вершиною смуги, бо всі `segments` кратні 4). Так смуга ніде не заходить усередину конуса — саме це давало трикутні «артефакти» (циліндр з `n×8` сегментів і лінійним радіусом проти двох відрізків профілю чаші з 40 гранями). `u = 0` спереду (+Z), як у `CylinderGeometry`, тож атлас кільця не міняється. Обідки-тори — на краях смуги з радіусом `profileRadius(y) + BAND_LIFT + tube`.
2. **Грааль з decor лишає піднятий циліндр** (`shape: 'raised'`) для кільця й рима — це навмисний виступ запеченого вигляду, він скрізь зовні тіла; сегментів 120 (замість `n×8`). Його поясок — по профілю основи.
3. **Плями — власні декалі.** `projectDecal(geometry, spot)` у `engine/surface-geometry.ts` — як `DecalGeometry` з three (той самий підхід: трикутники в коробці проєктора, обрізання Сазерленда–Ходжмена по 6 площинах, uv з координат проєктора), але в просторі геометрії (без `matrixWorld`) і з відкиданням трикутників, чия нормаль грані `· spot.normal ≤ 0.25`: інакше декаль лягає й на внутрішню стінку чаші, зворот медалі чи бік зірки. Коробка — куб `size × size × size` з центром у `spot.position`; `up` — світовий Y, спроєктований на площину нормалі (якщо нормаль майже вертикальна — Z); `right = up × normal`. Вершини зсунуті по інтерпольованій нормалі вершини на `DECAL_LIFT = 0.0015`. `DecalGeometry` не імпортуємо.
4. **Поверхня — з завантаженої моделі.** У `.glb` один меш без перетворення вузла; `surfaceOf(model, url)` бере геометрію першого `Mesh` (спільну з кешем `loadModel`). `buildDecor` отримує `Promise<Surface>`: фото, шрифти й наліпки вантажаться паралельно з моделлю, геометрія будується, щойно модель є.
5. **Квадратна основа.** Поясок кубка (`cup.band`) — `shape: 'face'`: пластина 0.32 × 0.04 на передній грані постаменту (z = 0.184 + 0.002, центр y 0.17), текстура пояска 1024×128. Табличка кубка опускається на 0.01 (центр y 0.09), щоб між ними був проміжок 0.01. Поясок статуетки — по профілю шати на y 0.262–0.338 (над верхом постаменту 0.25), корони — по профілю розтруба 0.115–0.165, грааля — по профілю основи 0–0.03. Таблички на гранях лишаються пластинами (`Plate`), бо грань пласка.
6. **Ділянки.** Кожне місце має `surface` (id поверхні форми) і займає прямокутник `u × v` на ній: для поверхонь обертання `u` — кут `atan2(x, z)` ± `(size/2)/hypot(x, z)` (з загортанням), для пласких — координата вздовж `right`; `v = y ± size/2`. Кільце/рим/круглий поясок займають `u = 'all'`. Накладання — та сама поверхня і перетин обох інтервалів із запасом `MARGIN = 0.008` (для кута — `MARGIN / r`).
7. **Порядок і запасні місця (детерміновано, лише з `(kind, shownDecor)`):** фото (не рухаються) → написи в порядку `INSCRIPTION_PLACES` (зворот кубка має запасне місце `base-back` — задня грань постаменту; інші написи без запасних) → наліпки: спершу всі, чиє власне місце вільне, займають його (у порядку масиву), потім витіснені (у порядку масиву) беруть найближче вільне місце наліпки за відстанню між `position` (рівність — порядок `STICKER_PLACES`). Немає вільного — частина не малюється (`at: null`).
8. **Дані не переписуються.** Редактор додає наліпку лише на вільне місце, тож нові дані вже без конфліктів; старі конфлікти розв'язуються при кожному малюванні. Прибрали медальйон — наліпка повертається на своє місце.
9. **Що бачить користувач.** `data-decor` показує фактичне місце: `stickers:front>left`, `front>none`, `inscriptions:back>base-back` (без переїзду — як раніше, тож старі e2e-рядки не міняються). Редактор у списку наліпок і в написах пише «Місце … зайняте (…) — тому тут: …» або «Не вміщується …»; у виборі місця зайняті вимкнені з «Зайнято: …».
10. **z-fighting.** Матеріали декалей і смуг: `polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4`; декалі `transparent: true, alphaTest: 0.05, depthWrite: false`, `renderOrder = 1`. Підйом 0.0015/0.003 — на око не видно.
11. **Продуктивність.** Геометрії декалей і смуг кешуються в модулі за ключем `[url моделі, слот, розмір, кількість фото для самоцвітів]` і позначаються `userData.shared = true`; `decorResources` не звільняє такі геометрії (як текстури наліпок). Кеш обмежений (6 форм × ≤ 50 ключів). Проєкція — один прохід по ~2–4 тис. трикутників моделі на пляму, раз на сторінку.
12. **Текстури** — розміри 25c (`DISC_PX 512`, `GEM_PX 256`, `TEXTURE_SCALE`), новий лише поясок на грані 1024×128. Медальйонний обідок-тор прибирається: на вигнутій чаші він стирчав; замість нього `drawPhotoDisc` малює металевий обідок у текстурі, коли рамка `none`.

## На що дивитись рецензенту

1. Зміна форми в редакторі (кубок → медаль) з наліпками на `base-left`: `shownDecor` їх ховає, розкладка й список наліпок показують лише показані, без падіння (тест у задачі 6).
2. Самоцвіти 1 → 4: нижній чи задній самоцвіт витісняє наліпку чи зворот, розкладка залежить від `photos.length` (тест у задачі 2).
3. Старий рядок, де дві наліпки витіснені, а вільне місце одне: перша в масиві його бере, друга `at: null`, не малюється, у редакторі «Не вміщується» з «Прибрати» (тести в задачах 2 і 6).
4. «Змінити» наліпку: її власне місце (і фактичне, якщо вона переїхала) у виборі місця вільне для неї самої (тест у задачах 2 і 6).
5. Пляма, під якою немає поверхні (декаль порожня): частина мовчки пропускається, решта оформлення малюється (тест у задачі 5).

---

### Задача 1. Профілі, поверхні й нові точки кріплення

**Files:**
- Modify: `apps/web/src/trophy/anchors.ts`
- Modify: `apps/web/src/trophy/anchors.test.ts`
- Modify: `apps/web/src/trophy/decor-layout.ts` (лише тип `Circle` з `surface`, `gemSpots` без змін у поведінці)

**Interfaces:**
- Produces:
  - `export type SurfaceKind = 'revolved' | 'flat'`
  - `export interface Profile { points: readonly (readonly [number, number])[]; segments: number }` — `[r, y]` знизу вгору, лише зовнішня поверхня, y зростає.
  - `export interface Spot { position: Vec3; normal: Vec3; size: number; surface: string }`
  - `export interface Plate { position: Vec3; tiltX: number; width: number; height: number; surface: string }`
  - `export interface Circle { center: Vec3; axis: 'y' | 'z'; radius: number; size: number; surface: string }`
  - `export type BandAnchor = { shape: 'profile'; surface: string; y0: number; y1: number; tori: readonly ('bottom' | 'top')[]; tube: number } | { shape: 'raised'; surface: string; y: number; height: number; radiusTop: number; radiusBottom: number; segments: number; tori: readonly { y: number; radius: number; tube: number }[] } | { shape: 'face'; plate: Plate }`
  - `export interface KindAnchors { profile?: Profile; surfaces: Record<string, SurfaceKind>; ring?: BandAnchor; rim?: BandAnchor; band?: BandAnchor; medallion?: Spot; back?: Spot; baseBack?: Spot; gems?: Circle; plaque?: Plate; stickers: Partial<Record<StickerPlace, Spot>> }`
  - `export function profileRadius(profile: Profile, y: number): number` — лінійна інтерполяція між сусідніми точками; поза межами — крайня.

- [ ] **Крок 1: тести.** У `anchors.test.ts`:
  - `'%s profile points are vertices of the model'` (для форм з `profile`): для кожної точки `[r, y]` у `.glb` є вершина з `|x − r| < 1e-3, |y' − y| < 1e-3, |z| < 1e-3` (лате починає з кута 0 → `x = r cos 0`). Позиції читати з `bufferView 0` так само, як `bounds()` читає JSON (додати `positions(kind): Float32Array`).
  - `'cup ring hugs the bowl'` переписати: `ring.shape === 'profile'`, `y0 = 0.72`, `y1 = 0.94`, `profileRadius(cup.profile, 0.8) === 0.3`.
  - `'cup band lies on the plinth face'`: `cup.band.shape === 'face'`; `plate.position[2]` у `[0.184, 0.188]`; `plate.width ≤ 0.368 − 0.02`; низ пояска ≥ верх таблички + 0.01; верх пояска ≤ 0.2.
  - `'statuette band sits above the plinth'`: `y0 ≥ 0.255`.
  - `'grail anchors are the baked ones'`: кільце `shape: 'raised'` з колишніми числами, але `segments: 120`; рим — колишні числа; табличка як була (плюс `surface`).
  - `'%s every spot names a known surface'`: усі `surface` плям, табличок, кіл і смуг є ключами `surfaces`.
  - `'cup base-back is on the back face'`: `baseBack.position = [0, 0.1, −0.186]`, `normal = [0, 0, −1]`, `size = 0.16`, `surface = 'plinth-back'`.
  - решта наявних тестів лишається (оновити лише доступ до полів смуги).
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/anchors.test.ts` — падають нові.
- [ ] **Крок 3: дані.** Профілі (зовнішні точки з `build-trophies.mjs`):
  - cup: `segments 40`, точки `[0.17,0.2] [0.16,0.25] … [0.1,0.55] [0.22,0.66] [0.3,0.8] [0.33,0.95] [0.35,1.0]` (зовнішня частина до вінця); поверхні `bowl` (revolved), `foot` (revolved), `plinth-front|back|left|right` (flat). ring `{ shape:'profile', surface:'bowl', y0:0.72, y1:0.94, tori:['bottom','top'], tube:0.012 }`; rim `{ profile, 'bowl', 0.955, 0.995, tori:['bottom','top'], tube:0.008 }`; band `face` як у рішенні 5 (`surface 'plinth-front'`); plaque y 0.09; medallion/back/stickers bowl з `surface:'bowl'`, `base-left|right` — `plinth-left|right`; `baseBack` як у тесті.
  - crown: `segments 40`, `[0.34,0.1] [0.36,0.14] [0.34,0.18] [0.34,0.42]`, поверхня `hoop`; ring `profile 0.18–0.42` з торами tube 0.01; band `profile 0.115–0.165` без торів.
  - statuette: `segments 28`, `[0.12,0.22] [0.1,0.4] [0.07,0.6]`, поверхня `robe`; band `profile 0.262–0.338`.
  - grail: `segments 120`, зовнішні точки профілю `grail()` від `[0,0]` до `[0.44,1.48]`, поверхні `body`, `base`; band `profile 0–0.03`.
  - medal: поверхні `front`, `back`, `edge-left`, `edge-right` (flat); star: `front`, `back`, `plinth-*`.
- [ ] **Крок 4: тимчасовий перехідник**, щоб гілка лишалась зеленою до задачі 5: у `engine/decor-meshes.ts` `band()` приймає `BandAnchor` — `profile` малюється колишнім `CylinderGeometry` з радіусами `profileRadius(y0|y1) + 0.003`, `raised` — як було, `face` — через `plate()`; у `decor-meshes.test.ts` оновити лише числа, що змінились з якорями. `pnpm vitest run --maxWorkers=2 apps/web/src/trophy` — зелене.
- [ ] **Крок 5: коміт** `feat(web): 25d trophy profiles, surfaces and face band anchors`.

---

### Задача 2. Розкладка без накладань (`decor-places.ts`)

**Files:**
- Create: `apps/web/src/trophy/decor-places.ts`
- Create: `apps/web/src/trophy/decor-places.test.ts`
- Modify: `apps/web/src/trophy/decor-layout.ts` (`decorSummary`), `apps/web/src/trophy/decor-layout.test.ts`
- Modify: `apps/web/src/trophy/lazy.test.ts` (додати `decor-places.ts` до чистих)

**Interfaces:**
- Consumes: `TROPHY_ANCHORS`, `Spot`, `Plate`, `BandAnchor` (задача 1), `gemSpots`, `shownDecor`.
- Produces:
  - `export type Occupant = { type: 'photos'; place: TrophyPhotoPlace } | { type: 'inscription'; place: InscriptionPlace } | { type: 'sticker'; place: StickerPlace; id: string }`
  - `export interface Footprint { surface: string; u: readonly [number, number] | 'all'; v: readonly [number, number] }`
  - `export function overlaps(a: Footprint, b: Footprint): boolean`
  - `export function spotFootprint(kind: TrophyKind, spot: Spot): Footprint`
  - `export interface PlacedInscription { inscription: Inscription; at: 'own' | 'base-back' | null; blockedBy: Occupant | null }`
  - `export interface PlacedSticker { id: string; place: StickerPlace; at: StickerPlace | null; blockedBy: Occupant | null }` — `blockedBy` — хто зайняв `place` (null, якщо не переїхала).
  - `export interface DecorLayout { photos: TrophyPhotoPlace | null; inscriptions: PlacedInscription[]; stickers: PlacedSticker[] }`
  - `export function layoutDecor(kind: TrophyKind, decor: TrophyDecor): DecorLayout` — рахує з `shownDecor(kind, decor)`; `photos` — `photoPlace`, коли фото показані, інакше null (у `backdrop` ділянок на кубку немає).
  - `export function stickerPlaceChoices(kind: TrophyKind, decor: TrophyDecor, editing: StickerPlace | null): { place: StickerPlace; takenBy: Occupant | null }[]` — для кожного місця з `DECOR_SUPPORT[kind].sticker`: зайняте фото, написом (фактичне розташування) чи іншою наліпкою (фактичне `at` або збережене `place`); наліпка `editing` не займає нічого.

- [ ] **Крок 1: тести** `decor-places.test.ts`:
  - `'front sticker moves off the cup medallion to the left'`: cup, медальйон 1 фото, наліпка `front` → `{ at: 'left', blockedBy: { type: 'photos', place: 'medallion' } }`.
  - `'star front sticker with a medallion goes to the base'`: star, медальйон, наліпка `front` → `at: 'base-left'` (left/right зірки теж під медальйоном).
  - `'an own place wins over a displaced sticker'`: cup, медальйон, наліпки `[front, left]` → `left.at = 'left'`, `front.at = 'right'`.
  - `'second displaced sticker with no room is dropped'`: star, медальйон, наліпки на `front, back, left, right, base-left` (back зайняте написом `back`) — перевірити, що кожне `at` унікальне, а котрій не вистачило — `at: null` з `blockedBy`.
  - `'cup back inscription moves to the base back under the ring'`: cup, кільце 3 фото, напис `back` → `at: 'base-back'`; без фото → `'own'`.
  - `'gems decide by count'`: cup, gems 1 фото + напис back → `own`; 4 фото → `base-back`.
  - `'grail back inscription under the raised ring is dropped'` → `at: null, blockedBy photos ring`.
  - `'only these own places collide'`: для кожної форми перебрати пари власних місць фото/написів (gems — для n 1…8) і порівняти множину конфліктних пар з очікуваною: cup `ring×back`, `gems×back`; grail `ring×back`, `gems×back`. Інших немає (зокрема cup `band×plaque` вільні).
  - `'choices: own place is free for the sticker being edited'`: cup, медальйон, наліпка front (фактично left): `stickerPlaceChoices(kind, decor, 'front')` — `left.takenBy === null`, `front.takenBy.type === 'photos'`; з `editing: null` — `left.takenBy.type === 'sticker'`.
  - `'layout is the same for the same decor'`: два виклики дають `toEqual`; результат не залежить від порядку ключів об'єкта.
  - `decor-layout.test.ts`: `decorSummary` — без переїздів рядки як раніше; з переїздом `stickers:front>left`, з відкиданням `front>none`, напис `inscriptions:back>base-back`.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/decor-places.test.ts apps/web/src/trophy/decor-layout.test.ts` — падають.
- [ ] **Крок 3: реалізація** за рішеннями 6–7. Ділянки: смуга `profile`/`raised` → `{ surface, u: 'all', v: [y0, y1] }`; `face` і `Plate` → `u = x ± w/2` (для граней `±X` — `z`), `v = y ± h/2`; самоцвіти — по плямі на кожну `gemSpots(circle, n)` розміру `circle.size`; `backdrop` — без ділянок. `decorSummary` будує рядки з `layoutDecor`.
- [ ] **Крок 4:** тести проходять, `lazy.test.ts` теж.
- [ ] **Крок 5: коміт** `feat(web): 25d decor layout without overlaps, moved places in data-decor`.

---

### Задача 3. Геометрія по поверхні: декаль і смуга з профілю

**Files:**
- Create: `apps/web/src/trophy/engine/surface-geometry.ts`
- Create: `apps/web/src/trophy/engine/surface-geometry.test.ts`
- Create: `apps/web/src/trophy/engine/glb-fixture.ts` (лише для тестів: `.glb` з диска → `BufferGeometry`)
- Modify: `apps/web/src/trophy/engine/models.ts` (`surfaceOf`), `apps/web/src/trophy/engine/models.test.ts`

**Interfaces:**
- Consumes: `Spot`, `Profile`, `profileRadius` (задача 1).
- Produces:
  - `export const DECAL_LIFT = 0.0015; export const BAND_LIFT = 0.003;`
  - `export function projectDecal(surface: BufferGeometry, spot: Spot, lift?: number): BufferGeometry | null` — неіндексована, атрибути `position`, `normal`, `uv`; null, якщо жодного трикутника.
  - `export function profileBand(profile: Profile, y0: number, y1: number, lift?: number): BufferGeometry` — `LatheGeometry`, 17 рядів, `profile.segments * 3` сегментів.
  - `export function bandEdgeRadius(profile: Profile, y: number, tube: number): number` = `profileRadius + BAND_LIFT + tube`.
  - `export function sharedGeometry(key: string, make: () => BufferGeometry | null): BufferGeometry | null` — модульний кеш, `userData.shared = true`; null теж кешується.
  - `export interface Surface { key: string; geometry: BufferGeometry }`; у `models.ts`: `export function surfaceOf(model: Group, key: string): Surface` (перший `Mesh`).
  - `glb-fixture.ts`: `export function glbGeometry(kind: string): BufferGeometry` (позиції, нормалі, індекси з `apps/web/public/models/<kind>.glb` через `node:fs`, як в `anchors.test.ts`).

- [ ] **Крок 1: тести** `surface-geometry.test.ts` (на справжніх моделях через `glbGeometry`):
  - `'cup front sticker decal lies on the bowl'`: кожна вершина декалі `TROPHY_ANCHORS.cup.stickers.front` має `hypot(x,z) − profileRadius(cup.profile, y)` у `[0, 0.006]`; `z > 0.2` (не внутрішня стінка); uv у `[0, 1]`; нормалі `· spot.normal > 0.25`.
  - `'medal medallion decal skips the back and the sides'`: усі нормалі `z > 0.25`.
  - `'decal size stays within the projector box'`: вздовж `right`/`up` від центру ≤ `size/2 + 1e-6`.
  - `'decal in the air is null'`: пляма `[0, 2, 0]` → `null`.
  - `'decal reads upright from the front'`: у декалі на передній плямі кубка вершина з найбільшим `y` має `uv.y` > 0.9, з найбільшим `x` — `uv.x` > 0.9 (не дзеркально).
  - `'cup ring band never sinks into the bowl'`: `profileBand(cup.profile, 0.72, 0.94)` — для кожної вершини `hypot(x,z) − profileRadius(y)` у `[0.0025, 0.006]`; перший трикутник спереду має нормаль назовні (`(b−a)×(c−a) · radial > 0`); вершина з `uv.x = 0` має `x ≈ 0, z > 0`.
  - `'shared geometry is built once'`: `sharedGeometry('k', make)` двічі → той самий об'єкт, `make` викликано раз, `userData.shared === true`.
  - `models.test.ts`: `surfaceOf` повертає геометрію першого меша з ключем.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/surface-geometry.test.ts apps/web/src/trophy/engine/models.test.ts` — падають.
- [ ] **Крок 3: реалізація** за рішеннями 1 і 3. Для `projectDecal`: на кожен трикутник (з індексом чи без) — нормаль грані з позицій; відкинути `≤ 0.25`; вершини в систему проєктора `(right, up, normal)` відносно центру; обрізати полігон по `|x|,|y|,|z| ≤ size/2`; трикутники віялом; позиція назад + `vertexNormal · lift` (нормаль з атрибута, інтерпольована баріцентрично; для плоских граней — нормаль грані); `uv = (x/size + 0.5, y/size + 0.5)`.
- [ ] **Крок 4:** тести проходять.
- [ ] **Крок 5: коміт** `feat(web): 25d decals projected on the model mesh and profile bands`.

---

### Задача 4. Полотна: поясок на грані й обідок медальйона в текстурі

**Files:**
- Modify: `apps/web/src/trophy/decor-canvas.ts`, `apps/web/src/trophy/decor-canvas.test.ts`
- Modify: `apps/web/src/trophy/decor-layout.ts` (константи розмірів)

**Interfaces:**
- Produces:
  - `export const BAND_PX = { ring: { width: 1024, height: 64 }, face: { width: 1024, height: 128 } } as const` у `decor-layout.ts`.
  - `drawBand(ctx, inscription, material, size: { width: number; height: number } = BAND_PX.ring)` — поле тексту `size.width − 48 × size.height − 8`, кегль до `0.69 × size.height`.
  - `drawPhotoDisc(ctx, image, photo, decor, px, material = 'gold', bezel = false)` — `bezel && frame === 'none'`: металевий обідок шириною `px × 0.035` (градієнт `metalStops(material, 'plate')`), фото в колі `half − px × 0.035`.

- [ ] **Крок 1: тести** у `decor-canvas.test.ts` (той самий мок контексту, що вже є): `'band fills the face size'` — `fillRect(0, 0, 1024, 128)` і кегль ≤ 88; `'medallion bezel is painted when there is no frame'` — є дуга радіуса `px/2` і внутрішня `px/2 − px*0.035`; з рамкою `gold` — лише наявний обідок рамки; `bezel = false` — як раніше.
- [ ] **Крок 2:** падають.
- [ ] **Крок 3:** реалізація.
- [ ] **Крок 4:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/decor-canvas.test.ts` — проходить.
- [ ] **Крок 5: коміт** `feat(web): 25d face band canvas and painted medallion bezel`.

---

### Задача 5. `buildDecor` на поверхні моделі

**Files:**
- Modify: `apps/web/src/trophy/engine/decor-meshes.ts`, `apps/web/src/trophy/engine/decor-meshes.test.ts`
- Modify: `apps/web/src/trophy/engine/trophy-engine.ts`, `apps/web/src/trophy/engine/trophy-engine.test.ts`

**Interfaces:**
- Consumes: `layoutDecor` (задача 2), `projectDecal`, `profileBand`, `bandEdgeRadius`, `sharedGeometry`, `Surface`, `surfaceOf` (задача 3), `BAND_PX`, `drawPhotoDisc(..., bezel)` (задача 4).
- Produces: `export async function buildDecor(kind: TrophyKind, material: TrophyMaterial, decor: TrophyDecor, size: TrophySize, textures: DecorTextures, surface: Promise<Surface>): Promise<{ group: Group; backdrop: Texture | null; textures: Texture[] }>`. Імена мешів: `decor-ring`, `decor-ring-torus`, `decor-rim`, `decor-band`, `decor-plaque`, `decor-medallion`, `decor-gem`, `decor-back` (і на `base-back`), `decor-sticker-<фактичне місце>`; `decor-medallion-bezel` більше немає.

- [ ] **Крок 1: тести** `decor-meshes.test.ts` (поверхня — `Promise.resolve({ key: '/models/cup.glb', geometry: glbGeometry('cup') })`, для інших форм відповідно; наявні тести переписати під нові геометрії, а не видаляти):
  - `'ring follows the bowl profile'`: `decor-ring` — не `CylinderGeometry`; вершини як у тесті задачі 3; два `decor-ring-torus`.
  - `'cup band is a plate on the plinth face'`: `decor-band` — `PlaneGeometry` з центром z ∈ `[0.184, 0.188]`, полотно 1024×128 (з урахуванням `TEXTURE_SCALE`).
  - `'stickers and medallion are decals'`: геометрії мають атрибут `uv` і не є `PlaneGeometry`/`CircleGeometry`; немає `decor-medallion-bezel`; полотно медальйона малюється з `bezel = true`.
  - `'front sticker under the medallion is drawn on the left'`: є `decor-sticker-left`, немає `decor-sticker-front`.
  - `'a dropped sticker is not drawn and takes no texture'`.
  - `'cup back inscription under the ring goes to the base back'`: `decor-back` з центром z < −0.18, y ≈ 0.1.
  - `'decal over no surface is skipped'`: поверхня — порожня `BufferGeometry` → без мешів плям, без кидання; кільце (не залежить від поверхні) є.
  - `'decal geometry is shared between builds'`: дві збірки — той самий об'єкт геометрії `decor-sticker-front`, `userData.shared`.
  - `'grail ring stays raised'`: `decor-ring` — `CylinderGeometry` з 120 сегментами.
  - `trophy-engine.test.ts`: dispose не викликає `dispose` на геометріях з `userData.shared`; `buildDecor` отримує поверхню з тієї ж моделі (мок `loadModel`); грааль без decor — `grail-family.glb` і `buildDecor` не викликається.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine` — падають.
- [ ] **Крок 3: реалізація.**
  - `buildDecor` спершу `layoutDecor(kind, decor)`; фото й наліпки малюються лише з `at !== null`, за фактичним місцем; напис `at: 'base-back'` — на `anchors.baseBack`.
  - Смуги: `profile` → `profileBand` через `sharedGeometry([key, slot])`; `raised` → як колишній `band()` з `segments`; `face` → `plate()` з полотном `BAND_PX.face`.
  - Плями (медальйон, зворот, самоцвіти, наліпки) → `await surface`, `sharedGeometry(JSON.stringify([surface.key, slot, spot]), () => projectDecal(surface.geometry, spot))`; null — пропустити меш (звільнити вже взяте полотно цієї частини через `textures.release`, щоб лічильник не тік).
  - Матеріали — рішення 10. Таблички — як були (`plate`), з `polygonOffset`.
  - `decorResources` у `trophy-engine.ts` пропускає геометрії з `userData.shared`.
  - `build()`: `const model = loadModel(url); const surface = model.then((m) => surfaceOf(m, url));` — `buildDecor(..., surface)`; модель для сцени — той самий проміс (одна копія).
- [ ] **Крок 4:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy` — усе зелене.
- [ ] **Крок 5: коміт** `feat(web): 25d decor drawn on the model surface with the overlap-free layout`.

---

### Задача 6. Наліпки в редакторі: «+ Додати наліпку», вікно, вільні місця, список

**Files:**
- Modify: `apps/web/src/prizes/tools/StickerPicker.tsx`, `apps/web/src/prizes/tools/StickerPicker.test.tsx`
- Create: `apps/web/src/prizes/tools/StickerDialog.tsx`
- Modify: `apps/web/src/prizes/tools/ShapeTool.tsx`
- Modify: `apps/web/src/prizes/studio-draft.ts`, `apps/web/src/prizes/studio-draft.test.ts`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Modify: стилі студії (той файл, де зараз `.studio-sticker-*`)

**Interfaces:**
- Consumes: `layoutDecor`, `stickerPlaceChoices`, `Occupant` (задача 2).
- Produces:
  - дія чернетки `{ type: 'sticker'; place: StickerPlace; id: string | null; from?: StickerPlace }` — `from` (якщо є й ≠ `place`) прибирається; сортування за `STICKER_PLACES` як було.
  - `StickerPickerProps` — як були, але `onPick: (place: StickerPlace, id: string | null, from?: StickerPlace) => void`; `decor: TrophyDecor` замість `stickers` (потрібна розкладка).
  - `export function occupantText(occupant: Occupant): string` у `StickerPicker.tsx` (експорт для задачі 7): фото → `t('studioPhotoPlace_<place>')`, напис → `t('studioText_<place>')`, наліпка → `t('studioTaken_sticker')`.
  - `placeText(place: StickerPlace | 'base-back')` — експорт; `'base-back'` → `studioPlace_base_back`.
- Нові рядки (uk), усі в `ADDED_25D`:
  - `studioStickerAdd: '+ Додати наліпку'`
  - `studioStickerTitleAdd: 'Нова наліпка'`, `studioStickerTitleEdit: 'Змінити наліпку'`
  - `studioStickerPick: 'Наліпка'`, `studioStickerWhere: 'Куди наліпити'`
  - `studioStickerDone: 'Готово'`, `studioStickerCancel: 'Скасувати'`
  - `studioStickerChange: 'Змінити'`, `studioStickerRemove: 'Прибрати'`
  - `studioStickerNoRoom: 'Вільних місць немає — приберіть щось, щоб додати наліпку.'`
  - `studioStickerMax: 'Наліпок уже {{n}} — більше не можна.'`
  - `studioTakenBy: 'Зайнято: {{what}}'`
  - `studioMovedTo: 'Місце «{{from}}» зайняте ({{what}}), тому тут: «{{to}}».'`
  - `studioNoPlace: 'Не вміщується: «{{from}}» зайняте ({{what}}), вільного місця немає.'`
  - `studioTaken_sticker: 'наліпка'`
  - `studioPlace_base_back: 'Зворот основи'`
  - `studioStickerNone` лишити в словниках, якщо немає перевірки невикористаних ключів; якщо є — прибрати з усіх 7 місць.

- [ ] **Крок 1: тести** `StickerPicker.test.tsx` (переписати) і `studio-draft.test.ts`:
  - `'adds a sticker through the dialog on a free place'`: клік «+ Додати наліпку» → `role="dialog"` з назвою «Нова наліпка»; клік відкритої наліпки; у групі «Куди наліпити» радіо «Спереду» вимкнене з текстом «Зайнято: Медальйон спереду» (decor з медальйоном); вибір «Ліворуч» → «Готово» → `onPick('left', id, undefined)`.
  - `'locked stickers show their level and cannot be picked'` (як було: `🔒 n`, `disabled`, без `<img>`); `kept` і поточна наліпка під час «Змінити» не замкнені.
  - `'lists added stickers with the moved place'`: decor з медальйоном і наліпкою `front` → рядок списку з мініатюрою і «Місце «Спереду» зайняте (Медальйон спереду), тому тут: «Ліворуч».»; «Прибрати» → `onPick('front', null)`.
  - `'change keeps its own place free'`: «Змінити» на цій наліпці → радіо «Ліворуч» (фактичне) і «Праворуч» увімкнені, обране за замовчуванням — фактичне місце; зміна місця → `onPick('right', id, 'front')`.
  - `'a dropped sticker says it does not fit'`: текст `studioNoPlace`, кнопка «Прибрати» є.
  - `'add is disabled when there is no room or the limit is reached'`: 6 наліпок → кнопка `disabled` і текст `studioStickerMax` з n = 6; усі місця зайняті → `studioStickerNoRoom`.
  - `'only shown stickers are listed after a shape change'`: kind `medal`, decor з наліпкою `base-left` → у списку її немає.
  - `'Escape and Cancel close without a pick'`; фокус повертається на «+ Додати наліпку».
  - `studio-draft.test.ts`: `'sticker with from moves it'` — `{ type:'sticker', place:'right', id:'x', from:'front' }` → одна наліпка на `right`.
  - `i18n.test.ts`: `ADDED_25D` у фільтрі.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/i18n.test.ts` — падають.
- [ ] **Крок 3: реалізація.**
  - `StickerDialog.tsx` — модальне вікно за зразком `CropDialog` (`role="dialog"`, `aria-modal`, `aria-labelledby`, фокус усередині, Esc): секція «Наліпка» — наявна сітка за серіями з замками (перенести з `StickerPicker`, `loading="lazy"`, закриті без gif); секція «Куди наліпити» — `fieldset` з радіо з `stickerPlaceChoices(kind, decor, editing)`, зайняті `disabled` з `studioTakenBy`; «Готово» вимкнене, доки не обрано наліпку й вільне місце; при додаванні за замовчуванням — перше вільне місце.
  - `StickerPicker` — список `shownDecor(kind, decor).stickers` з `layoutDecor` (мініатюра 32 px, назва фактичного місця, примітка переїзду / «Не вміщується», «Змінити», «Прибрати»), під ним кнопка «+ Додати наліпку» і пояснення, коли вона вимкнена.
  - `ShapeTool` передає `decor={draft.decor}` і `onPick={(place, id, from) => dispatch({ type: 'sticker', place, id, from })}`.
  - CSS: кнопки ≥ 44 px, логічні відступи (`margin-inline`, `inset-inline`), кольори зі змінних Blood Moon; вікно на телефоні 320 px без бічного прокручування.
  - Переклади в 6 json (не ru).
- [ ] **Крок 4:** тести проходять; `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/i18n.test.ts apps/web/src/trophy`.
- [ ] **Крок 5: коміт** `feat(web): 25d sticker dialog with free places and the list of added stickers`.

---

### Задача 7. Примітки про переїзд написів у редакторі

**Files:**
- Modify: `apps/web/src/prizes/tools/TextTool.tsx`, `apps/web/src/prizes/tools/TextTool.test.tsx`
- Modify: `apps/web/src/prizes/tools/PhotoTool.tsx`, `apps/web/src/prizes/tools/PhotoTool.test.tsx`

**Interfaces:**
- Consumes: `layoutDecor` (задача 2), `occupantText`, `placeText` і рядки `studioMovedTo`, `studioNoPlace`, `studioTakenBy` (задача 6).

- [ ] **Крок 1: тести.**
  - `TextTool.test.tsx` `'back inscription under the ring says where it went'`: кубок, кільце 2 фото, напис «Зворот» увімкнений → під ним «Місце «Зворот» зайняте (Кільце по чаші), тому тут: «Зворот основи».».
  - `'grail back under the ring does not fit'`: грааль, кільце → `studioNoPlace`; галочку можна зняти.
  - `PhotoTool.test.tsx` `'choosing the ring tells that the back text moves'`: decor з написом back, вибір «Кільце по чаші» → та сама примітка під вибором місця фото.
- [ ] **Крок 2:** падають.
- [ ] **Крок 3:** у `TextTool` під кожним увімкненим написом з `at !== 'own'` — `<p className="meta">` з `studioMovedTo` (`to = placeText('base-back')`) або `studioNoPlace`; у `PhotoTool` під вибором місця — ті самі примітки для всіх написів, що переїхали чи не вміщуються.
- [ ] **Крок 4:** `pnpm vitest run --maxWorkers=2 apps/web/src/prizes` — проходить.
- [ ] **Крок 5: коміт** `feat(web): 25d studio notes when an inscription moves or does not fit`.

---

### Задача 8. e2e «part 25d» зі знімками з трьох боків

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 25d: …')` після part 25c)

**Interfaces:**
- Consumes: `data-decor` з фактичними місцями (задача 2), діалог наліпок (задача 6), примітки (задача 7); хелпери part 25c (`drawnPngs25c`, `shot`, `POLL`, `exact`, `expectNoSideScroll`).

- [ ] **Крок 1: тест.** Назва: `part 25d: trophy decor on the surface — Оля makes a cup with three photos on the ring, a back inscription that moves to the base back, a base band on the plinth face and stickers on the left and the base right, and a second cup with a medallion where the front sticker added first moves to the left; the studio says where things went and the sticker dialog shows only free places; the same decor shows in the prize viewer; screenshots from the front, the side and the back`. Кроки:
  - Оля (десктоп 1280×800, `emulateMedia({ reducedMotion: 'reduce' })`, щоб кубок стояв) у студії: кубок, золото. Наліпки: «+ Додати наліпку» → у вікні наліпка → «Ліворуч» → «Готово»; друга — «Основа праворуч». Фото: 3 намальовані PNG на «Кільце по чаші». Написи: «Зворот», «Поясок», «Табличка».
  - Перевірити примітку «Зворот основи» у написах і `data-decor` = `photos:ring:3;inscriptions:band,plaque,back>base-back;stickers:left,base-right` (порядок — як дає `decorSummary`).
  - Знімки полотна студії `p25d-ring-front`, потім `ArrowRight` × 6 на полотні (90°) — `p25d-ring-side`, ще × 6 — `p25d-ring-back`. Зберегти приз.
  - Другий приз: кубок; спершу наліпка «Спереду», потім фото «Медальйон спереду» (1 PNG). Перевірити в списку наліпок «… тому тут: «Ліворуч».», у вікні нової наліпки радіо «Спереду» і «Ліворуч» вимкнені з «Зайнято: …»; `data-decor` = `photos:medallion:1;stickers:front>left`. Знімки `p25d-medallion-front`, `-side`, `-back`. Зберегти.
  - Відкрити обидва призи в переглядачі (`/profile/prizes`, «Переглянути»): `data-decor` дорівнює студійному.
  - Сімейні фото не використовуються; жодних файлів з диска.
- [ ] **Крок 2:** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25d"` (передній план, < 10 хв) — спершу падає лише там, де ще щось не так; довести до зеленого.
- [ ] **Крок 3: очима.** Прочитати (Read) усі шість знімків з `apps/server/e2e/artifacts/shots/p25d-*.png` і письмово підтвердити у звіті: фото кільця щільно на чаші без трикутників; медальйон і наліпки вигнуті по чаші, нічого не стирчить пласким квадратом і не провалюється; наліпка не на медальйоні; поясок читається на передній грані основи; зворот — на задній грані основи. Якщо щось не так — виправити в коді задач 3–5 і повторити.
- [ ] **Крок 4:** прогнати сусідні e2e `-t "part 25a"` і `-t "part 25c"` (кожен окремим викликом) — зелені (рядки `data-decor` без переїздів не змінились).
- [ ] **Крок 5: коміт** `test(e2e): part 25d decor on the surface, moved stickers and the sticker dialog`.
