# Частина 25e — нові форми й матеріали трофеїв із замками за рівнем

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** 15 нових оригінальних форм трофеїв і 11 нових матеріалів; кожна нова форма й матеріал відкривається з рівня (замок як у шрифтів, сервер перевіряє), п'ять позначені «преміум» (без оплати); редактор групує форми «Кубки / Медалі / Корони й вінки / Статуетки»; кожна нова форма має місця для оформлення в моделі 25d (профіль, поверхні, смуги, плями) і всі вони лежать на поверхні моделі.

**Архітектура:** форми — нові `.glb` того самого скрипта `apps/web/scripts/build-trophies.mjs` (один меш, один матеріал, ліниво за `modelUrl`); переліки `TROPHY_KINDS` / `TROPHY_MATERIALS` лише доповнюються; рівні відкриття — нові рядки `LEVEL_REWARDS` (`kind: 'shape' | 'material'`), перевірка `trophyLocked` у `packages/shared` для сервера й редактора; вигляд матеріалу — розширений `MATERIAL_LOOK` (світіння, перламутр, візерунок мармуру/дерева в шейдері) у `engine/materials.ts`.

**Технології:** React 19, Vite, three ~0.183 (лише `apps/web/src/trophy/engine`, ліниво), zod, Fastify, vitest, e2e через `apps/server/e2e`.

**Специфікація:** `docs/superpowers/specs/2026-11-09-trophy-decals-and-shapes-design.md`, розділ «25e». Залежність: план `docs/superpowers/plans/2026-11-09-plan-25d-trophy-decals.md` уже злитий у `main` — його `KindAnchors` (`profile`, `surfaces`, `BandAnchor`, `Spot.surface`, `baseBack`), `layoutDecor`/`decor-places.ts`, `projectDecal`, `glbGeometry` — основа цього плану. Якщо 25d ще не злитий — не починати.

## Глобальні обмеження

- `GAME_STATE_VERSION` лишається 22; `packages/engine` не чіпаємо. Знімки кімнат містять `placedPrizeSchema` → `prizeContentSchema`: переліки лише доповнюються, старий знімок розбирається без змін (старі сервери нас не цікавлять).
- Схеми строгі (`.strict()`), переліки лише розширюються; старі рядки `prize` / `prize_award` валідні й виглядають так само (старі `.glb` байт у байт ті самі, старі матеріали — ті самі параметри `MeshStandardMaterial`).
- Вручений сімейний грааль (`/models/grail-family.glb`, грааль без decor) не змінюється.
- `three` лише в `apps/web/src/trophy/engine/`, ліниво (перевіряє `apps/web/src/trophy/lazy.test.ts`).
- Розмір моделі: кожна нова `.glb` ≤ **80 000 Б**, усі 15 разом ≤ **800 000 Б**; старий загальний `MAX_BYTES 200_000` лишається для старих.
- Усі наявні форми (cup, medal, crown, star, statuette, grail) і матеріали (bronze, silver, gold, diamond) відкриті з рівня 1, як зараз.
- Оригінальні форми: жодних копій захищених дизайнів (Кубок світу ФІФА, «Оскар», кубок Ліги чемпіонів УЄФА, тарілка Вімблдону, Залізний / Мальтійський хрест тощо) — лише нагадують тип нагороди.
- Нові рядки: uk в `apps/web/src/i18n.ts`, список `ADDED_25E` в `apps/web/src/i18n.test.ts` (і у фільтрі `fresh.filter(...)`), переклади в 6 json (en, pl, de, es, it, ar); ru — ніколи; нічого про росію; кирилиця лише в словниках і тестах. Апостроф в uk — `’`, як у більшості рядків словника.
- CSS — логічні властивості (RTL), палітра Blood Moon (змінні з `styles.css`), цілі дотику ≥ 44 px.
- Сімейні фото ніколи в git, тестах чи e2e.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`; prettier не запускати. Наприкінці кожної задачі — `pnpm -r typecheck` зелений.
- e2e: спершу `pnpm build`, потім у передньому плані `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25e"`, кожен виклик < 10 хв.
- Гілка `plan-25e` від `main` після злиття 25d.

## Рішення

### 1. Форми (id, група, рід, будова)

Висота ~1, низ на y = 0, лице до +Z, один меш (усі частини через `merge`), без UV. Постамент — наявний `plinth(half, height)` (квадрат, грань `half·cos45`). «Поясок» (`band`) на постаменті — `shape: 'face'` над табличкою, як у кубка в 25d (постамент заввишки ≥ 0.2).

| id | група | uk (рід) | будова | чим відрізняється від захищеного |
|---|---|---|---|---|
| `lovingcup` | Кубки | кубок з вухами (m) | `plinth(0.26, 0.2)`, кругла ступінчаста ніжка, широка присадкувата чаша r 0.12→0.37 на y 0.45→0.88 з вінцем; дві великі **замкнені петлі-вуха** (тор R 0.15, r 0.03, повне коло) на ±X, приєднані до верхньої половини чаші | не Ліга чемпіонів: там вуха від вінця до ніжки на високому тонкому тілі |
| `vase` | Кубки | ваза (f) | лате 48 сегментів: кругла ніжка r 0.16 (y 0–0.04), черево r 0.27 (y 0.5), горло r 0.1 (y 0.9), розтруб r 0.16 (y 1.0), внутрішня стінка горла; без постаменту й вух | — |
| `plate` | Кубки | тарілка-трофей (f) | диск-тарілка r 0.4 з бортом і заглибленням (лате, повернутий `rotX(π/2)` як медаль), центр y 0.62, на ніжці-тримачі з `plinth(0.24, 0.2)` | не Вімблдон: гладке дно без рельєфних фігур |
| `goblet` | Кубки | келих (m) | лате 40: диск ніжки r 0.2 (y 0–0.03), тонка ніжка r 0.03 з вузлом-кулькою на y 0.3, чаша-півкуля r 0.27 на y 0.48–0.95 з вінцем | — |
| `starmedal` | Медалі | медаль-зірка (f) | `starShape(0.36, 0.15, 0.06, 0.02)` на y 0.42 + кільце-вушко + дві стрічки, як `medal()` | — |
| `cross` | Медалі | хрест (m) | рівнораменний хрест 0.7 × 0.7, рамена завширшки 0.16 з **круглими** кінцями, круглий диск r 0.13 у центрі, товщина 0.05, на y 0.42, вушко й стрічки | не Залізний (розширені прямі рамена, кайма) і не Мальтійський (8 кінців) |
| `octagon` | Медалі | восьмикутна медаль (f) | восьмикутна призма r 0.34 з фаскою (новий хелпер `prism(points, depth, bevel)`, пласкі нормалі) і піднятим внутрішнім восьмикутником, вушко й стрічки | — |
| `ribbon` | Медалі | медаль на стрічці (f) | диск r 0.3 (як медаль, менший) під **широкою V-стрічкою** з двох пластин 0.16 × 0.5 і планкою-застібкою 0.34 × 0.06 нагорі | — |
| `diadem` | Корони | діадема (f) | `plinth(0.22, 0.08)`, тонкий обруч (лате r 0.3, y 0.12–0.2), спереду гребінь з арок (`rod`) і кульок, що підіймається до 0.55 по центру й спадає до боків, центральний камінь (сфера r 0.06) | — |
| `laurel` | Корони | лавровий вінок (m) | `plinth(0.22, 0.2)` + стрижень; дві дугові гілки (тор r 0.012, R 0.32, у площині XY), **розімкнені вгорі**, по 9 широких листків (сплюснута сфера 8×5) з кожного боку, бант унизу (дві петлі-тори й кінці-пластини) | — |
| `olive` | Корони | оливковий вінок (m) | як `laurel`, але **замкнене коло**, вузькі довгі листки й 10 маслин (сфери r 0.02); вузол унизу; спільний хелпер `wreath({ open, leaf, berries })` | — |
| `figure` | Статуетки | фігурка на постаменті (f) | `plinth(0.22, 0.2)`, круглий барабан-п'єдестал (лате r 0.15, y 0.2–0.36), фігура: ноги (`rod`), тулуб (лате), голова (сфера), **одна рука вгору з вінком-тором**, друга вздовж тіла | не «Оскар»: не схрещені руки з мечем, не котушка, не ар-деко |
| `flame` | Статуетки | вогонь (m) | `plinth(0.22, 0.2)`, чаша-тримач (лате y 0.2–0.42), полум'я з 5 крапле-подібних лате, повернутих і нахилених по колу, найвища до y 1.0 | — |
| `wings` | Статуетки | крилата статуетка (f) | `plinth(0.22, 0.2)`, стрижень, куля r 0.1 на y 0.45, два крила-віяла з 7 пласких пір'їн (`box`, повернуті дугою) з обох боків до y 1.0 | — |
| `fist` | Статуетки | кулак (m) | `plinth(0.22, 0.2)`, передпліччя (лате r 0.09→0.11, y 0.2–0.62) з манжетою, кулак: долоня (`box` зі скругленням сферами), 4 зігнуті пальці (`rod` + сфери), великий палець спереду | — |

Група наявних: `cup`, `grail` → Кубки; `medal` → Медалі; `crown` → Корони; `star`, `statuette` → Статуетки.

Значки (`TROPHY_EMOJI`): lovingcup `🏆`, vase `🏺`, plate `🏆`, goblet `🥂`, starmedal `🏅`, cross `🏅`, octagon `🏅`, ribbon `🎗️`, diadem `👑`, laurel `🌿`, olive `🫒`, figure `🏆`, flame `🔥`, wings `🕊️`, fist `✊`.

### 2. Місця оформлення нових форм (`DECOR_SUPPORT`)

| id | photo | inscription | sticker |
|---|---|---|---|
| lovingcup | ring, medallion, gems, plaque, backdrop | rim, band, plaque, back | усі 6 |
| vase | ring, medallion, gems, backdrop | band | front, back, left, right |
| plate | medallion, gems, backdrop | band, plaque, back | front, base-left, base-right |
| goblet | ring, medallion, gems, backdrop | rim, band | front, back, left, right |
| starmedal | medallion, gems, backdrop | back | left, right |
| cross | medallion, gems, backdrop | back | front, left, right |
| octagon | medallion, gems, backdrop | back | front, left, right |
| ribbon | medallion, gems, backdrop | back | front, left, right |
| diadem | medallion, gems, plaque, backdrop | band, plaque | back, left, right, base-left, base-right |
| laurel, olive | plaque, backdrop | band, plaque | front, base-left, base-right |
| figure | ring, medallion, gems, plaque, backdrop | band, plaque | усі 6 |
| flame | medallion, plaque, backdrop | band, plaque | front, back, base-left, base-right |
| wings | medallion, gems, plaque, backdrop | band, plaque | left, right, base-left, base-right |
| fist | ring, medallion, plaque, backdrop | band, plaque | front, back, base-left, base-right |

Смуги: `ring` / `rim` — `shape: 'profile'` по поверхні обертання (чаша, черево вази, барабан фігурки, передпліччя кулака); `band` — `profile` на круглій ніжці (vase, goblet, по профілю ніжки y 0–0.04 / 0–0.03) і на обручі (diadem), решта — `face` на передній грані постаменту. `baseBack` (задня грань постаменту) — лише `lovingcup` (запасне місце для `back` під кільцем, як у кубка). Інших накладань власних місць немає (див. задачу 4).

### 3. Матеріали

`MATERIAL_LOOK` стає `Record<TrophyMaterial, MaterialLook>`, `interface MaterialLook { color: string; metallic: number; roughness: number; emissive?: string; emissiveIntensity?: number; iridescence?: number; pattern?: { kind: 'marble' | 'wood'; color: string } }`. Старі чотири — без змін і без нових полів.

| id | uk прикм. m / f / іменник | color | metallic | roughness | особливе |
|---|---|---|---|---|---|
| `rosegold` | Рожевозолотий / Рожевозолота / Рожеве золото | `#E0A48C` | 1 | 0.22 | — |
| `platinum` | Платиновий / Платинова / Платина | `#E5E4E2` | 1 | 0.15 | — |
| `copper` | Мідний / Мідна / Мідь | `#C46A3C` | 1 | 0.3 | — |
| `obsidian` | Обсидіановий / Обсидіанова / Обсидіан | `#1E1A24` | 0.1 | 0.08 | — |
| `jade` | Нефритовий / Нефритова / Нефрит | `#3E9E6E` | 0 | 0.25 | — |
| `pearl` | Перламутровий / Перламутрова / Перламутр | `#F2EBE0` | 0.1 | 0.3 | `iridescence: 1` (`MeshPhysicalMaterial`) |
| `ruby` | Рубіновий / Рубінова / Рубін | `#B0122E` | 0 | 0.05 | — |
| `sapphire` | Сапфіровий / Сапфірова / Сапфір | `#1F4FB8` | 0 | 0.05 | — |
| `neon` | Неоновий / Неонова / Неон | `#FF2E63` | 0 | 0.4 | `emissive: '#FF2E63', emissiveIntensity: 1.4` |
| `marble` | Мармуровий / Мармурова / Мармур | `#EDEAE4` | 0 | 0.35 | `pattern: { kind: 'marble', color: '#8C8A86' }` |
| `wood` | Дерев’яний / Дерев’яна / Дерево | `#8A5A33` | 0 | 0.65 | `pattern: { kind: 'wood', color: '#5E3A1E' }` |

Групи матеріалів у редакторі: Метали — bronze, silver, gold, rosegold, platinum, copper; Камені — diamond, ruby, sapphire, jade, obsidian, pearl, marble; Інше — neon, wood.

Візерунок — `onBeforeCompile` з координатами об'єкта (UV у моделей немає): у вершинному шейдері `varying vec3 vTrophyPos = position;`, у фрагментному після `#include <color_fragment>`:
- marble: `float t = abs(sin((p.x + p.y * 0.6 + 0.35 * sin(p.z * 9.0 + p.y * 7.0)) * 14.0)); diffuseColor.rgb = mix(vein, diffuseColor.rgb, smoothstep(0.0, 0.35, t));`
- wood: `float t = fract(length(p.xz) * 36.0 + sin(p.y * 5.0) * 1.2); diffuseColor.rgb = mix(diffuseColor.rgb, ring, smoothstep(0.75, 1.0, t) * 0.8);`
`customProgramCacheKey = () => 'trophy-' + kind`. Колір значка й рамки диплома — `color`.

### 4. Рівні відкриття й «преміум»

Нові рядки `EXTRA_REWARDS` у `packages/shared/src/levels.ts` (наявні рядки не міняються, порядок у межах рівня — після наявних):

| рівень | форма | матеріал |
|---|---|---|
| 2 | goblet | — |
| 3 | — | copper |
| 4 | vase | — |
| 5 | laurel | — |
| 6 | starmedal | — |
| 7 | — | rosegold |
| 8 | figure | — |
| 9 | — | wood |
| 10 | octagon | — |
| 11 | — | marble |
| 12 | lovingcup | — |
| 13 | — | jade |
| 14 | ribbon | — |
| 15 | — | platinum |
| 16 | flame | — |
| 17 | — | obsidian |
| 18 | olive | — |
| 19 | — | pearl |
| 20 | cross | — |
| 21 | — | sapphire ★ |
| 22 | diadem ★ | — |
| 23 | — | ruby ★ |
| 24 | plate | — |
| 25 | — | neon ★ |
| 26 | wings ★ | — |
| 28 | fist | — |

★ — «преміум»: `PREMIUM_KINDS = ['diadem', 'wings']`, `PREMIUM_MATERIALS = ['sapphire', 'ruby', 'neon']` у `prizes.ts`. Преміум — лише позначка в редакторі; відкривається тим самим рівнем, сервер преміум не перевіряє (платежів немає, власник вирішить пізніше).

Замок як у шрифтів: збережене в цьому призі (`stored.kind` / `stored.material`) лишається чинним, навіть якщо закрите.

### 5. Назви в 7 мовах (рід для `trophyGender`)

Назва — `trophy_<id>` (з малої, як наявні), рід — у `TROPHY_GENDER` (uk) і `TROPHY_GENDER_BY_LOCALE`. Лише `m | f`: іменники обрано так, щоб середнього роду й множини не було.

| id | en | pl (рід) | de (рід) | es (рід) | it (рід) | ar (рід) |
|---|---|---|---|---|---|---|
| lovingcup | loving cup | puchar z uchwytami (m) | Henkelpokal (m) | copa de asas (f) | coppa con anse (f) | كأس بمقبضين (f) |
| vase | vase | waza (f) | Vase (f) | jarrón (m) | vaso (m) | مزهرية (f) |
| plate | trophy plate | patera (f) | Trophäenteller (m) | plato trofeo (m) | piatto trofeo (m) | طبق (m) |
| goblet | goblet | kielich (m) | Kelch (m) | cáliz (m) | calice (m) | قدح (m) |
| starmedal | star medal | medal gwiazda (m) | Sternmedaille (f) | medalla estrella (f) | medaglia a stella (f) | ميدالية نجمة (f) |
| cross | cross | krzyż (m) | Kreuzmedaille (f) | cruz (f) | croce (f) | صليب (m) |
| octagon | octagonal medal | medal ośmiokątny (m) | achteckige Medaille (f) | medalla octogonal (f) | medaglia ottagonale (f) | ميدالية مثمنة (f) |
| ribbon | ribbon medal | medal na wstędze (m) | Medaille am Band (f) | medalla con cinta (f) | medaglia con nastro (f) | ميدالية بشريط (f) |
| diadem | diadem | diadem (m) | Tiara (f) | diadema (f) | diadema (m) | تاج صغير (m) |
| laurel | laurel wreath | wieniec laurowy (m) | Lorbeerkranz (m) | corona de laurel (f) | corona d'alloro (f) | إكليل غار (m) |
| olive | olive wreath | wieniec oliwny (m) | Olivenkranz (m) | corona de olivo (f) | corona d'ulivo (f) | إكليل زيتون (m) |
| figure | figure on a pedestal | figurka na cokole (f) | Figur auf Sockel (f) | figura en pedestal (f) | figura su piedistallo (f) | تمثال على قاعدة (m) |
| flame | flame | płomień (m) | Flamme (f) | llama (f) | fiamma (f) | شعلة (f) |
| wings | winged statuette | skrzydlata statuetka (f) | Flügelstatuette (f) | estatuilla alada (f) | statuetta alata (f) | تمثال مجنح (m) |
| fist | raised fist | pięść (f) | Faust (f) | puño (m) | pugno (m) | قبضة (f) |

de: прикметник «Goldene achteckige Medaille» — `trophyPhrase` дає саме це (прикметник матеріалу попереду). Прикметники матеріалів m/f і іменник (`material_<id>`) — у кожній мові за її правилами, як наявні (es/it — «de oro»/«d'oro»-подібні: «de cobre», «di rame», «de madera», «di legno», …).

### 6. Нові рядки інтерфейсу (uk, усі в `ADDED_25E`)

- `trophy_<id>` × 15 (таблиця 1), `material_<id>` × 11 і `material_<id>_m`, `material_<id>_f` × 11 (таблиця 3)
- `studioKindGroup_cups: 'Кубки'`, `studioKindGroup_medals: 'Медалі'`, `studioKindGroup_crowns: 'Корони й вінки'`, `studioKindGroup_statuettes: 'Статуетки'`
- `studioMaterialGroup_metals: 'Метали'`, `studioMaterialGroup_stones: 'Камені'`, `studioMaterialGroup_other: 'Інше'`
- `studioPremium: 'преміум'`, `studioPremiumHint: 'Преміум — особливі форми й матеріали. Поки вони відкриваються рівнем.'`
- `reward_shape: 'Форма трофея: {name}'`, `reward_material: 'Матеріал трофея: {name}'`
- `err_trophy_locked: 'Ця форма чи матеріал трофея ще закриті: вони відкриються з вищим рівнем.'`
Замок — наявні `lookLocked` + `levelFromLevel` («🔒 з рівня 24»).

## На що дивитись рецензенту

1. Старий приз `cup` / `gold` (і знімок кімнати з ним) після злиття розбирається тією самою схемою й малюється тим самим `MeshStandardMaterial` (колір, metalness, roughness, без `onBeforeCompile`) — тест у задачі 5; старі `.glb` байт у байт ті самі — тест у задачі 1.
2. Власник призу, що вже має закриту форму (рівень упав чи приз створено адміном): редагування з тією самою формою й матеріалом не відмовляє (`stored`), зміна на іншу закриту — `trophy_locked` (тести в задачах 2 і 3).
3. Запит без decor, але з закритою формою: сервер рахує рівень і відмовляє (раніше рівень рахувався лише з decor) — тест у задачі 3.
4. Зміна форми з оформленням на нову форму з меншою кількістю місць (кубок з `base-left` → `starmedal`): `shownDecor` ховає непідтримане, розкладка без падіння — тест у задачі 4.
5. Неон і перламутр на телефоні: один спільний матеріал на модель (не новий шейдер на кожен кадр), `customProgramCacheKey` стабільний — тест у задачі 5.

---

### Задача 1. Моделі 15 нових форм у `build-trophies.mjs`

**Files:**
- Modify: `apps/web/scripts/build-trophies.mjs`
- Create: `apps/web/public/models/{lovingcup,vase,plate,goblet,starmedal,cross,octagon,ribbon,diadem,laurel,olive,figure,flame,wings,fist}.glb` (результат скрипта)
- Modify: `apps/web/public/models/CREDITS.txt` (нові моделі — власна робота, CC0 1.0)
- Modify: `apps/web/src/trophy/models.test.ts`

**Interfaces:**
- Produces: файли `/models/<id>.glb` за таблицею рішення 1; у скрипті — `export`-у немає, але зовнішні профілі кожного лате записані в коментарі над функцією (їх копіює задача 4); хелпери `prism(points, depth, bevel)` і `wreath({ open, leaf, berries })`.

- [ ] **Крок 1: тести** у `models.test.ts` (поки без зміни переліків — свій список):
  - `const NEW_KINDS = ['lovingcup', …, 'fist'] as const` (15).
  - `'%s.glb is one mesh with one plain metal material'` — розширити на `NEW_KINDS`.
  - `'%s.glb fits the size budget'`: кожна ≤ 80 000 Б; сума 15 ≤ 800 000 Б.
  - `'%s.glb stands on the floor facing front'`: `min[1]` у `[-0.005, 0.005]`, `max[1]` у `[0.8, 1.1]`, `|min[0] + max[0]| ≤ 0.02` (симетрія по X, крім `fist`/`flame` — ≤ 0.08), висота ≥ ширини × 0.9 для статуеток і кубків.
  - `'old models are byte-identical'`: наявний тест плюс sha `grail` і `grail-family` (поточні значення з `main`).
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/models.test.ts` — падають нові.
- [ ] **Крок 3: побудова.** Нові функції за таблицею рішення 1 в тому ж стилі (`lathe`, `torus`, `sphere`, `box`, `rod`, `transform`, `merge`); старі функції не змінювати ні на символ (інакше зміняться sha). У циклі запису — ліміт `NEW_MAX_BYTES = 80_000` для нових. Нормалі гладких тіл — `{ smooth: true }`, як у грааля. `node apps/web/scripts/build-trophies.mjs` пише всі файли.
- [ ] **Крок 4:** тести проходять (вигляд моделей перевіряє контактний аркуш задачі 8).
- [ ] **Крок 5: коміт** `feat(web): 25e fifteen new trophy models built by the script`.

---

### Задача 2. Переліки, рівні відкриття, «преміум», `trophyLocked`

**Files:**
- Modify: `packages/shared/src/prizes.ts`, `packages/shared/src/prizes.test.ts`
- Modify: `packages/shared/src/levels.ts`, `packages/shared/src/levels.test.ts`
- Modify: `packages/shared/src/decor.ts` (`DECOR_SUPPORT` — тимчасово порожні місця нових форм)
- Modify: `apps/web/src/trophy/trophy-meta.ts` (`TROPHY_EMOJI`, `MATERIAL_LOOK`, `TROPHY_GROUPS`, `MATERIAL_GROUPS`), `apps/web/src/trophy/decor-layout.ts` (`METAL`), `apps/web/src/locales/grammar.ts` (роди), `apps/web/src/trophy/anchors.ts` (тимчасові порожні якорі)
- Modify: `apps/web/src/profile/LevelCard.tsx` (`rewardText`)

**Interfaces:**
- Produces:
  - `TROPHY_KINDS` = старі шість, далі 15 нових у порядку таблиці 1; `TROPHY_MATERIALS` = старі чотири, далі 11 у порядку таблиці 3.
  - `export const PREMIUM_KINDS: readonly TrophyKind[]`, `export const PREMIUM_MATERIALS: readonly TrophyMaterial[]` (рішення 4).
  - `LevelReward` + `| { kind: 'shape'; id: TrophyKind } | { kind: 'material'; id: TrophyMaterial }` (`import type` з `./prizes`).
  - `export function trophyUnlockLevel(what: 'shape' | 'material', id: string): number` у `levels.ts` — рівень з `LEVEL_REWARDS`, якого немає — 1.
  - `export function trophyLocked(trophy: { kind: TrophyKind; material: TrophyMaterial }, level: number, stored: { kind: TrophyKind; material: TrophyMaterial } | null | undefined): boolean` у `prizes.ts` — true, коли форма закрита для `level` і `≠ stored.kind`, або так само матеріал.
  - `export const TROPHY_GROUPS: readonly { id: 'cups' | 'medals' | 'crowns' | 'statuettes'; kinds: readonly TrophyKind[] }[]` і `MATERIAL_GROUPS: readonly { id: 'metals' | 'stones' | 'other'; materials: readonly TrophyMaterial[] }[]` у `trophy-meta.ts` (рішення 1 і 3).
  - `MaterialLook` (рішення 3), експорт з `trophy-meta.ts`.

- [ ] **Крок 1: тести.**
  - `prizes.test.ts`: тест на невідому форму — `'vase'` → `'urn'`; `'new kinds and materials parse'` (`plate`/`neon`); `'an old placed prize parses to the same value'` (`placedPrizeSchema` для `cup`/`gold` з decor — `toEqual` вхідному); `trophyLocked`: рівень 1 `plate` → true, рівень 24 → false, рівень 1 `plate` зі `stored.kind === 'plate'` → false, рівень 1 `cup`/`neon` → true, `cup`/`gold` → false; `PREMIUM_*` ⊂ переліків.
  - `levels.test.ts`: `'old reward rows are unchanged'` (наявний OLD проходить); `'every new shape and material has one level'` — для кожної нової форми й матеріалу рівно один рядок, рівень — з таблиці рішення 4 (`trophyUnlockLevel('shape','plate') === 24`, `('material','neon') === 25`, `('shape','cup') === 1`, `('material','gold') === 1`); рівні в межах 2…30. Наявні тести, що перелічують нагороди певних рівнів (`nextRewards`, `rewardsUpTo`), оновити лише доданням нових рядків.
  - `trophy-meta.test.ts`: `'groups cover every kind and material once'`.
  - `LevelCard` тест (наявний файл тестів профілю): `rewardText({ kind: 'shape', id: 'plate' })` → `'Форма трофея: тарілка-трофей'`.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 packages/shared apps/web/src/trophy/trophy-meta.test.ts apps/web/src/profile` — падають.
- [ ] **Крок 3: реалізація.** Переліки, рядки `EXTRA_REWARDS` за таблицею рішення 4, `trophyUnlockLevel`, `trophyLocked`, `PREMIUM_*`. Записи `Record<TrophyKind|TrophyMaterial, …>` у вебі: `TROPHY_EMOJI` (рішення 1), `MATERIAL_LOOK` (рішення 3), `METAL` — для нових `band`/`plate` три зупинки `[темніше на 35 %, color, світліше на 35 %]` (порахувати й записати сталими рядками), роди з рішень 1 і 5. Тимчасово (до задачі 4): `DECOR_SUPPORT[нова] = { photo: ['backdrop'], inscription: [], sticker: [] }`, `TROPHY_ANCHORS[нова] = { surfaces: {}, stickers: {} }`. `rewardText` — випадки `shape` (`reward_shape`, `name: t('trophy_<id>')`) і `material` (`reward_material`, `name: t('material_<id>')`). Рядки `reward_shape`, `reward_material` — тут (uk + 6 json), решта i18n — задача 6.
- [ ] **Крок 4:** тести проходять; `pnpm -r typecheck` зелений; `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/prizes` зелений.
- [ ] **Крок 5: коміт** `feat(shared): 25e new trophy kinds and materials with unlock levels and premium marks`.

---

### Задача 3. Сервер перевіряє форму й матеріал

**Files:**
- Modify: `apps/server/src/prizes.ts`, `apps/server/src/prizes.test.ts`
- Modify: `apps/server/src/prize-routes.ts`, `apps/server/src/prize-routes.test.ts`
- Modify: `apps/web/src/i18n.ts` (`err_trophy_locked`), 6 json

**Interfaces:**
- Consumes: `trophyLocked`, `trophyUnlockLevel` (задача 2).
- Produces: `createPrize` / `updatePrize` повертають також `{ ok: false, error: 'trophy_locked' }` (409); перевірка форми — перед перевіркою decor.

- [ ] **Крок 1: тести.**
  - `prizes.test.ts`: `'locked shape is refused on create'` (`plate`, рівень 1 → `trophy_locked`; рівень 24 → ok); `'locked material is refused'` (`cup`/`neon`, рівень 1); `'stored shape stays valid on update'` (рядок з `plate` у базі, оновлення на рівні 1 з тим самим `plate` → ok; на `wings` → `trophy_locked`); `'old kinds need no level'` (`cup`/`gold`, рівень 1 → ok).
  - `prize-routes.test.ts`: `'shape without decor still checks the level'` — POST `{ trophy: { kind: 'plate', material: 'gold' } }` без decor від акаунта рівня 1 → 409 `{ error: 'trophy_locked' }`; той самий з `cup` → 201 і `accountLevel` не викликається (шпигун чи лічильник запитів, як наявні тести).
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/server/src/prizes.test.ts apps/server/src/prize-routes.test.ts` — падають.
- [ ] **Крок 3: реалізація.** `levelFor` рахує рівень, коли є decor **або** `trophyUnlockLevel('shape', kind) > 1` **або** `trophyUnlockLevel('material', material) > 1`. У `createPrize` — `trophyLocked(stored.trophy, level, null)`, в `updatePrize` — з `row.content.trophy`. `err_trophy_locked` у 7 мовах (без ru).
- [ ] **Крок 4:** тести проходять.
- [ ] **Крок 5: коміт** `feat(server): 25e refuse locked trophy shapes and materials`.

---

### Задача 4. Якорі нових форм у моделі 25d і місця на поверхні

**Files:**
- Modify: `packages/shared/src/decor.ts` (`DECOR_SUPPORT` — таблиця рішення 2), `packages/shared/src/decor.test.ts`
- Modify: `apps/web/src/trophy/anchors.ts`, `apps/web/src/trophy/anchors.test.ts`
- Modify: `apps/web/src/trophy/decor-places.ts` (лише якщо запасне `base-back` у 25d зашите на `cup` — узагальнити до «є `anchors.baseBack`»), `apps/web/src/trophy/decor-places.test.ts`
- Create: `apps/web/src/trophy/engine/surface-fit.test.ts`

**Interfaces:**
- Consumes: `KindAnchors`, `Profile`, `BandAnchor`, `Spot`, `Plate`, `Circle`, `profileRadius` (25d `anchors.ts`); `layoutDecor`, `spotFootprint`, `overlaps` (25d `decor-places.ts`); `projectDecal`, `profileBand` (25d `engine/surface-geometry.ts`); `glbGeometry` (25d `engine/glb-fixture.ts`); `gemSpots` (`decor-layout.ts`).
- Produces: `TROPHY_ANCHORS[<нова>]` для всіх 15: `profile` (для форм з поверхнею обертання — зовнішні точки з коментаря скрипта, `segments` моделі), `surfaces` (id: `bowl`, `foot`, `belly`, `neck`, `dish-front`, `dish-back`, `face`, `back`, `edge-left`, `edge-right`, `hoop`, `crest`, `drum`, `holder`, `orb`, `wing-left`, `wing-right`, `forearm`, `knot`, `plinth-front|back|left|right` — лише ті, що є у формі), смуги, плями, таблички, кола самоцвітів, `baseBack` для `lovingcup`; `export const NEW_KINDS_25E: readonly TrophyKind[]` в `anchors.ts` (для тестів і e2e).

- [ ] **Крок 1: тести.**
  - `anchors.test.ts`: наявні `'%s anchors match the support table'`, `'%s every spot names a known surface'`, `'%s profile points are vertices of the model'` уже йдуть по `TROPHY_KINDS` — мають пройти й для нових. Додати `'lovingcup base-back is on the back face'` (`normal [0,0,−1]`, `surface 'plinth-back'`, z = −(0.26·cos45 + 0.002) ± 0.002).
  - `surface-fit.test.ts` (на справжніх `.glb` через `glbGeometry`), для кожної `NEW_KINDS_25E`:
    - `'%s every spot lies on the surface'`: для медальйона, звороту, `baseBack`, кожної наліпки й кожної з `gemSpots(circle, n)` при n = 1, 4, 8 — `projectDecal(geometry, spot)` не null, площа трикутників декалі, спроєктована на площину плями, ≥ 0.6 × `size²` (для самоцвітів ≥ 0.5 × `π·size²/4`), а кожна вершина декалі не далі `size/2 + 0.01` від `spot.position`.
    - `'%s plates and face bands sit on a face'`: для таблички й `band.shape === 'face'` — пляма з центром `plate.position`, нормаллю з `tiltX`, розміром `min(width, height)` дає декаль з площею ≥ 0.9 × size² (табличка не звисає з грані).
    - `'%s profile bands hug the body'`: для `ring`/`rim`/`band` з `shape: 'profile'` — кожна вершина `profileBand(profile, y0, y1)` має `hypot(x, z) − profileRadius(y)` у `[0.0025, 0.006]`, а `y0`, `y1` у межах профілю.
  - `decor-places.test.ts`: розширити 25d-тест `'only these own places collide'` — для нових форм очікувано: `lovingcup` — `ring×back`, `gems×back` (як `cup`); решта — жодних накладань між власними місцями написів, наліпок, таблички й смуг (накладання фото × наліпка дозволені: наліпка переїжджає). Новий `'lovingcup back inscription under the ring moves to the base back'`.
  - `decor.test.ts`: `'shape change hides unsupported decor'` — `shownDecor('starmedal', decor з наліпкою base-left і написом band)` → без них; `layoutDecor('starmedal', …)` не кидає.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy packages/shared/src/decor.test.ts` — падають.
- [ ] **Крок 3: дані.** `DECOR_SUPPORT` за рішенням 2; якорі вимірювати за геометрією скрипта (центр плями — на поверхні, нормаль — зовнішня нормаль поверхні в тій точці, розмір наліпок 0.06–0.12 і медальйона 0.1–0.3 залежно від ділянки, як у наявних формах); смуги — рішення 2. Коментар над кожною формою — розміри, з яких виміряно (як у наявних).
- [ ] **Крок 4:** тести проходять; `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/prizes packages/shared` зелений.
- [ ] **Крок 5: коміт** `feat(web): 25e decor anchors of the new shapes on their surfaces`.

---

### Задача 5. Нові матеріали в рушії

**Files:**
- Create: `apps/web/src/trophy/engine/materials.ts`, `apps/web/src/trophy/engine/materials.test.ts`
- Modify: `apps/web/src/trophy/engine/models.ts` (`paintModel`), `apps/web/src/trophy/engine/models.test.ts`
- Modify: `apps/web/src/trophy/diploma.ts` (колір тексту рамки), `apps/web/src/trophy/diploma.test.ts`

**Interfaces:**
- Consumes: `MATERIAL_LOOK`, `MaterialLook` (задача 2).
- Produces: `export function trophyMaterial(material: TrophyMaterial): MeshStandardMaterial` у `engine/materials.ts` — `MeshPhysicalMaterial` (підклас) лише з `iridescence`; `emissive`/`emissiveIntensity`; `pattern` → `onBeforeCompile` за рішенням 3 і `customProgramCacheKey`; кеш одного матеріалу на `TrophyMaterial` у модулі, `userData.shared = true` (рушій такий не звільняє — як спільні геометрії 25d). `paintModel` бере матеріал звідси.

- [ ] **Крок 1: тести** `materials.test.ts`:
  - `'old materials are plain standard materials as before'`: для bronze/silver/gold/diamond — `constructor === MeshStandardMaterial`, `color.getHexString()`, `metalness`, `roughness` з `MATERIAL_LOOK`, `emissiveIntensity === 1` і `emissive` чорний, `onBeforeCompile` — типовий (не перевизначений).
  - `'pearl is iridescent'`: `MeshPhysicalMaterial`, `iridescence === 1`.
  - `'neon glows'`: `emissive.getHexString() === 'ff2e63'`, `emissiveIntensity === 1.4`.
  - `'marble and wood paint a pattern'`: виклик `onBeforeCompile` на фальшивому `shader` (`{ vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>', uniforms: {} }`) додає `vTrophyPos` в обидва й рядок `sin(p.z * 9.0` (marble) / `fract(length(p.xz) * 36.0` (wood); `customProgramCacheKey()` — `'trophy-marble'` / `'trophy-wood'`.
  - `'one material per kind is shared'`: два виклики → той самий об'єкт, `userData.shared === true`.
  - `models.test.ts` (engine): `paintModel(group, 'neon')` ставить спільний матеріал на меші без текстури, меші з `map` не чіпає.
  - `trophy-engine.test.ts`: dispose не звільняє матеріал з `userData.shared`.
  - `diploma.test.ts`: рамка `obsidian` — колір рамки `#1E1A24`, текст рамки читається (колір тексту для неметалевих — `#3A7CA5`, як у diamond; для старих — без змін).
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/trophy` — падають.
- [ ] **Крок 3: реалізація** за рішенням 3. `diploma.ts`: `frame === MATERIAL_LOOK.diamond.color` → `look.metallic < 0.5` (для старих результат той самий).
- [ ] **Крок 4:** тести проходять; `lazy.test.ts` зелений (`materials.ts` у `engine/`).
- [ ] **Крок 5: коміт** `feat(web): 25e new trophy materials — iridescent pearl, glowing neon, marble and wood patterns`.

---

### Задача 6. Назви форм і матеріалів у 7 мовах

**Files:**
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/i18n.test.ts`, `apps/web/src/locales/{en,pl,de,es,it,ar}.json`
- Modify: `apps/web/src/locales/grammar.test.ts` (роди внесено в задачі 2; тут лише перевірка)
- Modify: `apps/web/src/trophy/trophy-meta.test.ts`

**Interfaces:**
- Consumes: переліки (задача 2).
- Produces: рядки рішення 6 (крім `reward_*`, `err_trophy_locked` — уже є).

- [ ] **Крок 1: тести.**
  - `i18n.test.ts`: `ADDED_25E` у фільтрі; наявні перевірки «кожен ключ uk є в 6 json» покривають решту.
  - `trophy-meta.test.ts` `'every kind and material makes a label in every locale'`: для кожної мови (крім ru, якої немає), кожної форми й матеріалу `trophyLabel` не містить `material_` / `trophy_` і не порожній.
  - Точні рядки: uk `trophyLabel({ kind: 'laurel', material: 'wood' })` → `'Дерев’яний лавровий вінок'`, `{ 'vase', 'rosegold' }` → `'Рожевозолота ваза'`; en `{ 'fist', 'copper' }` → `'Copper raised fist'`; de `{ 'octagon', 'gold' }` → `'Goldene achteckige Medaille'`, `{ 'goblet', 'gold' }` → `'Goldener Kelch'`; es `{ 'vase', 'gold' }` → `'Jarrón de oro'`; it `{ 'flame', 'gold' }` → `'Fiamma d'oro'`; pl `{ 'fist', 'gold' }` → `'Złota pięść'`; ar `{ 'crown' … }` як було, `{ 'flame', 'gold' }` → `'شعلة ذهبية'`.
  - `grammar.test.ts`: `trophyGender` для кожної нової форми в кожній мові — значення з таблиці рішення 5.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/i18n.test.ts apps/web/src/locales apps/web/src/trophy/trophy-meta.test.ts` — падають.
- [ ] **Крок 3:** рядки uk і переклади (якщо тест родів падає — виправити таблицю в `grammar.ts` за рішенням 5).
- [ ] **Крок 4:** тести проходять.
- [ ] **Крок 5: коміт** `feat(web): 25e names of the new trophy shapes and materials in seven languages`.

---

### Задача 7. Вибір форми й матеріалу: групи, замки, «преміум»

**Files:**
- Modify: `apps/web/src/prizes/tools/ShapeTool.tsx`
- Create: `apps/web/src/prizes/tools/ShapeTool.test.tsx`
- Modify: `apps/web/src/prizes/PrizeStudio.tsx` (`ToolProps.storedTrophy`), `apps/web/src/prizes/PrizeStudio.test.tsx`
- Modify: `apps/web/src/styles.css` (поруч із `.studio-choice`)

**Interfaces:**
- Consumes: `TROPHY_GROUPS`, `MATERIAL_GROUPS`, `TROPHY_EMOJI`, `trophyUnlockLevel`, `PREMIUM_KINDS`, `PREMIUM_MATERIALS` (задача 2), рядки задачі 6, `lookLocked`, `levelFromLevel`.
- Produces: `ToolProps.storedTrophy?: { kind: TrophyKind; material: TrophyMaterial } | null` (з `initial?.trophy`, без decor).

- [ ] **Крок 1: тести** `ShapeTool.test.tsx`:
  - `'shapes are grouped'`: усередині `fieldset` «Форма трофея» (`prizeKind`) — чотири вкладені `fieldset` з `legend` «Кубки», «Медалі», «Корони й вінки», «Статуетки»; у «Кубках» радіо «кубок», «грааль», «кубок з вухами», «ваза», «тарілка-трофей», «келих»; «Без трофея» — окремо після груп; усі радіо мають одне `name`.
  - `'locked shapes show their level'`: `level 1` — «тарілка-трофей» `disabled`, у мітці «🔒 з рівня 24»; «кубок» і «келих» з рівня 2 при `level 2` — увімкнені.
  - `'premium is marked'`: у мітках «діадема», «крилата статуетка», «сапфір», «рубін», «неон» — бейдж «преміум» (`.studio-premium`), у мітці «кубок» — немає; під групами — `studioPremiumHint`, лише коли є хоч один преміум у списку.
  - `'stored shape stays pickable'`: `level 1`, `storedTrophy { kind: 'plate', material: 'neon' }` — «тарілка-трофей» і «неон» не вимкнені.
  - `'materials are grouped and locked'`: групи «Метали», «Камені», «Інше»; «Мідь» при `level 1` — «🔒 з рівня 3».
  - `'picking dispatches the action'`: клік «ваза» (рівень 4) → `dispatch({ type: 'trophy', kind: 'vase' })`.
  - `PrizeStudio.test.tsx`: `storedTrophy` передається з `initial.trophy`.
- [ ] **Крок 2:** `pnpm vitest run --maxWorkers=2 apps/web/src/prizes` — падають.
- [ ] **Крок 3: реалізація.** Мітка: `<span aria-hidden>{emoji}</span> {назва}`, далі `look-lock` (як у шрифтів), далі `<span className="studio-premium">{t('studioPremium')}</span>`. Закрите — `className="is-locked"`, `disabled`, якщо не `storedTrophy` і не поточне в чернетці. CSS: сітка плиток у групі `display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))`, `min-block-size: 44px`, відступи `margin-inline`/`padding-inline`, бейдж — колір і рамка зі змінних Blood Moon; на 320 px без бічного прокручування.
- [ ] **Крок 4:** тести проходять; `pnpm vitest run --maxWorkers=2 apps/web/src/prizes apps/web/src/trophy apps/web/src/i18n.test.ts` зелений.
- [ ] **Крок 5: коміт** `feat(web): 25e grouped shape and material picker with level locks and premium marks`.

---

### Задача 8. e2e «part 25e» з контактними аркушами

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it('part 25e: …')` після part 25d)

**Interfaces:**
- Consumes: усе вище; `NEW_KINDS_25E` (задача 4); хелпери part 25c/25d (`shot`, `POLL`, `exact`, `expectNoSideScroll`, `drawnPngs25c`); `xpEntry`, `xpForLevel`, `kyivDay`.

- [ ] **Крок 1: тест.** Назва: `part 25e: new trophy shapes and materials — at level 1 Оля sees the plate locked «з рівня 24» and the diadem marked premium, the server refuses a locked plate; at level 30 she builds every new shape in gold and every new material on a cup, saves a neon laurel wreath with a plaque and a front sticker that shows the same in the prize viewer; contact sheets of all shapes and materials`. Кроки:
  - Оля (десктоп 1280×800, `emulateMedia({ reducedMotion: 'reduce' })`) у студії, рівень 1: у «Кубках» «тарілка-трофей» вимкнена з «🔒 з рівня 24»; «діадема» з бейджем «преміум». `POST /api/me/prizes` з `{ kind: 'plate', material: 'gold' }` (через `page.request` з її сесією) → 409 `trophy_locked`.
  - Дати рівень 30: `db.insert(xpEntry).values({ userId, source: 'game', gameId: randomUUID(), amount: xpForLevel(30), day: kyivDay(new Date()), createdAt: new Date() })`, перезавантажити студію.
  - Для кожної з `NEW_KINDS_25E`: обрати форму (золото), дочекатися `.trophy-fallback` = 0 і першого кадру полотна, знімок полотна студії в пам'ять (`locator.screenshot()` → `Buffer`) і на диск `p25e-shape-<id>`.
  - Форма «кубок»; для кожного нового матеріалу — так само `p25e-material-<id>`.
  - Контактні аркуші: нова сторінка, `setContent` з сіткою `<figure><img src="data:image/png;base64,…"><figcaption>id</figcaption></figure>` (5 стовпців, світле тло, без мережі) → `shot(...)` `p25e-contact-shapes` і `p25e-contact-materials`.
  - Приз «Неоновий лавровий вінок»: `laurel` + `neon`, напис «Табличка», наліпка «Спереду» через «+ Додати наліпку»; `data-decor` = `inscriptions:plaque;stickers:front`; зберегти; у переглядачі (`/profile/prizes`, «Переглянути») `data-decor` той самий, підпис «Неоновий лавровий вінок».
  - Старий приз (створений у цьому ж тесті до рівня 30: `cup`/`gold` з табличкою) у переглядачі — `data-decor` = `inscriptions:plaque`, підпис «Золотий кубок».
- [ ] **Крок 2:** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25e"` (передній план, < 10 хв) — до зеленого.
- [ ] **Крок 3: очима.** Прочитати (Read) `apps/server/e2e/artifacts/shots/p25e-contact-shapes.png` і `p25e-contact-materials.png` (за потреби — окремі `p25e-shape-*`) і письмово в звіті для кожної з 15 форм підтвердити: її можна впізнати за назвою з таблиці рішення 1; вона не копія захищеного дизайну з колонки «чим відрізняється» (зокрема `lovingcup` — не Ліга чемпіонів, `figure` — не «Оскар», `cross` — не Залізний хрест, `plate` — не Вімблдон); немає дірок і вивернутих граней. Для кожного з 11 матеріалів: відрізняється від сусідніх (рубін від неону, платина від срібла, мармур має прожилки, дерево — кільця, перламутр — переливи, неон світиться). Що не так — виправити в задачах 1, 4 чи 5 і повторити.
- [ ] **Крок 4:** сусідні e2e окремими викликами — `-t "part 25c"`, `-t "part 25d"` — зелені.
- [ ] **Крок 5: коміт** `test(e2e): part 25e new trophy shapes and materials with contact sheets`.
