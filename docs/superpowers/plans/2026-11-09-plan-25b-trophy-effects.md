# План 25b: ефекти кубка й анімації появи

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** кубок з `trophy.decor` має один постійний ефект (сяйво в обраному кольорі, іскри, промені, вогонь, сніжинки або нічого) і одну анімацію появи (обертання, підйом з постаменту, падіння з неба з підскоком, спалах). Анімація грає, коли кубок уперше з'являється на екрані (церемонія, «Твій приз», вітрина, перегляд). Рушій уміє програти її знову (кнопка «Поява» в редакторі 25c). Призи без `decor` виглядають і поводяться рівно як зараз.

**Spec:** `docs/superpowers/specs/2026-11-08-trophy-editor-design.md`. Розділи: «Що вирішив власник» (ефекти й анімації появи), «Анти-цілі» (церемонія на телефоні не гальмує), «Обмеження» (`prefers-reduced-motion`), «Як це зроблено → Продуктивність». Частина 25b. Поза планом: редактор, інструменти «Ефекти» й «Поява», вибір кольору (25c).

**Архітектура:**
- **shared не змінюється.** `trophyDecorSchema` уже має `effect: { kind, color? }` і `appearance` (25a), рендер 25a їх ігнорував. Нових полів немає, тож усі рядки `prize`, `prize_award` і знімки кімнат валідні без змін.
- **веб, чисті модулі без three** (тести в node):
  - `trophy/effect-plan.ts` — що й скільки малювати для розміру й режиму руху, симуляція частинок на `Float32Array`;
  - `trophy/appearance-pose.ts` — поза трофея в момент `t` кожної анімації появи.
- **рушій** `trophy/engine/*`:
  - `engine/effect-meshes.ts` — об'єкти ефекту (`Sprite` для сяйва й променів, один `Points` на частинки, тобто один draw call);
  - `engine/appearance-props.ts` — спалах і диск-постамент;
  - `engine/stage.ts` — площини відсікання на вигляд (для «підйому»);
  - `engine/trophy-engine.ts` — підключає все разом, `data-effect`, `data-appearance`, `replayAppearance()`.
- Ефект живе в `scene`, не в групі трофея: сніг і вогонь не крутяться з кубком, а кадрування (`framingSphere(trophy)`) їх не бачить. Анімація появи змінює лише позу групи `trophy` (зсув, поворот, масштаб, видимість). Камера стоїть.
- `TrophyView` отримує `appear?: boolean` (за замовчуванням `true`) і `ref` з `replayAppearance()`. Поверхні не змінюються, окрім прев'ю старого `PrizeEditor` (`appear={false}`).

**Технології:** TypeScript, three.js `~0.183.2` (уже є), React 19 + Testing Library (jsdom), vitest, Playwright через vitest (e2e).

## Global Constraints

- `GAME_STATE_VERSION` лишається **22**. `packages/engine` і `packages/shared` не змінюються. Якщо раптом без цього ніяк, зупинитися й спитати власника до пушу.
- Призи без `decor` малюються й рухаються як зараз: ні ефекту, ні анімації появи, ні атрибутів `data-effect`/`data-appearance`.
- Ефект один на кубок, діє постійно. Переліки — `TROPHY_EFFECTS` і `TROPHY_APPEARANCES` з `@quiz/shared`. Свої ефекти й анімації поза ними не додаються.
- `prefers-reduced-motion: reduce` (через `reducedMotion()` з `apps/web/src/motion.ts`): сяйво й промені статичні; іскри, вогонь і сніг вимкнені; анімація появи не грає (`data-appearance="<kind>:skipped"`).
- Продуктивність: частинки — один `Points` на трофей зі спільною текстурою-крапкою. Межа частинок `EFFECT_BUDGET = { stage: 48, view: 48, phone: 32, card: 12 }`. У розмірі `card` ефект завжди статичний, тож картки вітрини не тримають цикл кадрів. Один спільний `WebGLRenderer` на сторінку (архітектура 25a), без нових WebGL-контекстів.
- Спільні текстури ефектів (крапка, сяйво, промені) — одна на сторінку, як `shadow()` у 25a. `dispose` вигляду їх не звільняє. Геометрії й матеріали вигляду звільняє.
- `three` імпортують лише файли `apps/web/src/trophy/engine/`. `effect-plan.ts` і `appearance-pose.ts` без `three` (`lazy.test.ts`).
- 25b не додає рядків інтерфейсу. Якщо рядок усе ж знадобиться: uk в `apps/web/src/i18n.ts`, ключ у новому `ADDED_25B` в `apps/web/src/i18n.test.ts`, переклади в 6 json (en, pl, de, es, it, ar). ru ніколи. Нічого, пов'язаного з росією. Кириличні літерали в `apps/web/src` лише в словниках і тестах.
- Сімейні фото з `D:\myfiles\cup1` ніколи не потрапляють у git, тести, e2e чи знімки. У e2e лише картинки, намальовані в сторінці.
- Тести: `pnpm vitest run --maxWorkers=2 <шлях>`. Prettier не запускати. e2e: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "<частина>"` (знімки з `E2E_SHOTS=1`), лише на передньому плані.
- Гілка `plan-25b` з `main`, кожна задача — коміт.

## Відкладене з 25a

У журналі 25a (`.superpowers/sdd/2026-11-08-plan-25a-trophy-render/progress.md`) жодне зауваження не призначене на 25b. Ті, що призначені на 25c (GPU-пам'ять текстур, точки кріплення з задачі 5, буфер рендерера з задачі 7), лишаються там. Беремо одне дрібне зауваження задачі 7, бо 25b додає вигляди, що постійно просять кадр: «visible zero-size spinning view keeps rAF running with nothing to draw» (задача 3). Ще одне зауваження задачі 10 («reduced-motion equality could poll for two equal frames first») враховане в новому e2e (задача 7).

## Review Focus

- Адитивне сяйво чи промені на прозорому полотні (`alpha: true`, копія через `drawImage`) зникають або дають чорний квадрат навколо кубка. Очікуємо видиме кольорове гало поза силуетом (задача 7, перевірка `haloPixels25b`; задача 4, тест `glow and rays are additive and behind`).
- Площина відсікання «підйому» в одного вигляду просочується в інші трофеї на спільному рендерері, і в сусіда зникає низ (задача 3, тест `clipping planes are per view`).
- Кубок поза екраном (вітрина нижче згину, церемонія на прокрученому телефоні) програє анімацію невидимим, і людина бачить уже нерухомий кубок. Очікуємо: годинник появи йде лише з кадрами, що справді намальовані (задача 5, тест `the appearance waits for the first drawn frame`).
- Багато трофеїв з ефектами разом (вітрина: 6 живих карток, церемонія: 3) тримають цикл кадрів і гріють телефон. Очікуємо: картки статичні й без обертання не просять кадрів (задача 5, тест `a card with an effect does not keep the loop`; задача 3, тест `a zero-size moving view does not keep the loop`).
- `replayAppearance()` посеред анімації, після `dispose`, під reduced motion чи без `decor`. Очікуємо: перезапуск з нуля, або нічого, і без винятку (задача 5, тест `replay restarts, and is a no-op after dispose, when calm or without decor`).

## Рішення (там, де специфікація лишила місце будівельнику)

**Одиниці.** `r` — радіус `framingSphere(trophy)` після збирання моделі з оформленням. `c` — його центр (`target`). Підлога — `y = 0`.

**Ефекти** (`effectPlan`):

| `kind` | Що це | Звичайний режим | `card` | reduced motion |
|---|---|---|---|---|
| `glow` | `Sprite` у `c`, масштаб `2.6r`, радіальний градієнт кольору → прозорий, адитивний; пульс прозорості `0.75 ± 0.15`, 0.8 Гц | animated | static (0.75) | static (0.75) |
| `rays` | `Sprite` у `c`, масштаб `3.2r`, 12 клинів `#fff4c2`, адитивний, прозорість 0.6, обертання `material.rotation` 0.25 рад/с | animated | static | static |
| `sparks` | `Points`, народжуються на кільці радіуса `0.6r` на висоті `[0.75, 1.0]·(c.y + r)`; швидкість угору `0.5–0.9 r/с`, назовні `0.3 r/с`, гравітація `−0.6 r/с²`; життя `0.9–1.6 с`; колір `#ffd36b` → чорний; розмір `0.06r`; адитивні | animated | static | off |
| `fire` | `Points`, народжуються на кільці `0.55r` при `y ∈ [0, 0.1r]`; угору `0.6–1.0 r/с`, похитування `sin` з амплітудою `0.05r`; життя `0.8–1.3 с`; колір `#fff1a8` → `#ff7a1a` → `#c21d0b` → чорний; розмір `0.14r`; адитивні | animated | static | off |
| `snow` | `Points` у коробці `x, z ∈ [−1.4r, 1.4r]`, `y ∈ [0, c.y + 1.4r]`; падіння `0.25–0.4 r/с`, знос `sin` з амплітудою `0.08r`; нижче 0 → нагору; білий, звичайне змішування, прозорість 0.9; розмір `0.07r` | animated | static | off |
| `none` | — | off | off | off |

- Кількість частинок дорівнює `EFFECT_BUDGET[size]`. Перед першим кадром симуляція прогрівається на `PREWARM_S = 1.5` с кроками `1/30` с, щоб ефект не починався з порожнечі. Статичний режим — кадр після прогріву, далі нерухомий.
- «Чорний» в адитивному змішуванні означає «невидимий»: частинка згасає кольором, без прозорості на вершину.
- `effect.color` діє лише на `glow`. Без кольору — `GLOW_DEFAULT = '#ffd36b'`. Інші ефекти мають сталі кольори з таблиці.
- Сяйво й промені: `depthTest false`, `depthWrite false`, `renderOrder −1`, тобто завжди позаду кубка. Частинки: `depthTest true`, `depthWrite false`.
- Генератор випадкових чисел — `mulberry32(seed)` у `effect-plan.ts`. Рушій сіє його номером вигляду, тести — сталою.

**Анімації появи** (`appearancePose(kind, t)`, `t = минулий час / APPEAR_SECONDS[kind]`, обрізаний до `[0, 1]`):

`APPEAR_SECONDS = { spin: 1.4, rise: 1.6, drop: 1.3, flash: 1.5 }`. Кожна коротша за `CEREMONY_MS.step` (3500).

```ts
export interface AppearancePose {
  lift: number;     // зсув групи по y, у r
  turn: number;     // додатковий поворот навколо Y, рад
  scale: number;    // рівномірний масштаб
  squash: number;   // множник scale.y (удар об підлогу)
  visible: boolean; // група трофея видима
  flash: number;    // прозорість спалаху, 0..1
  pedestal: number; // прозорість диска-постаменту, 0..1
  clip: boolean;    // відсікати все нижче y = 0
}
export const NEUTRAL_POSE: AppearancePose = { lift: 0, turn: 0, scale: 1, squash: 1, visible: true, flash: 0, pedestal: 0, clip: false };
```

`e(x) = 1 − (1 − x)³` (ease-out cubic). При `t = 1` кожна анімація дає `NEUTRAL_POSE`, крім `spin`, де `turn = 4π` (≡ 0).
- `spin`: `turn = 4π·e(t)`, `scale = 0.6 + 0.4·e(t)`.
- `rise`: `lift = −2·(1 − e(t))`, `clip = t < 1`, `pedestal = t ≤ 0.8 ? 1 : (1 − t) / 0.2`. Постамент — світлий диск (`CircleGeometry`, радіус `0.6·max(size.x, size.z)`, `y = 0.002`, `#f6e3a6`, адитивний) над площиною відсікання. Кубок піднімається крізь нього.
- `drop`:
  - падіння: `lift = 3·(1 − (t/0.5)²)` при `t < 0.5`;
  - перший підскок: `0.35·sin(π·(t − 0.5)/0.25)` при `t ∈ [0.5, 0.75)`;
  - другий: `0.1·sin(π·(t − 0.75)/0.15)` при `t ∈ [0.75, 0.9)`, далі 0;
  - удари: `squash = 1 − 0.15·max(0, 1 − |t − 0.5|/0.04) − 0.08·max(0, 1 − |t − 0.75|/0.04)`.
- `flash`:
  - спалах: `flash = t < 0.15 ? t/0.15 : max(0, 1 − (t − 0.15)/0.35)`;
  - кубок: `visible = t ≥ 0.15`, `scale = 0.3 + 0.7·e(u)`, `turn = 2π·e(u)`, де `u = (t − 0.15)/0.85`, обрізане до `[0, 1]`;
  - спалах — `Sprite` у `c`, біла радіальна текстура, адитивний, `depthTest false`, `renderOrder 10`, масштаб `3r·(0.5 + flash)`.
- Тінь під кубком: прозорість `SHADOW_OPACITY · (visible ? 1 − 0.7·clamp(lift/3, 0, 1) : 0)`.
- Годинник появи рахує `delta` з `beforeRender`, тобто лише намальовані кадри. Поки вигляд невидимий, анімація чекає (`data-appearance="<kind>:pending"`). Перший намальований кадр має `t = 0`.
- Тяг пальцем під час анімації працює: `yaw` гравця додається до `turn`.

**Атрибути полотна** (для e2e, лише коли є `decor`):
- `data-effect="<kind>:<mode>"`, де `mode` ∈ `animated | static | off`; наприклад `fire:animated`, `glow:static`, `none:off`;
- `data-appearance="<kind>:<state>"`, де `state` ∈ `pending | playing | done | skipped`.

**Коли грає поява:** при кожному `mount` з `appear: true` (поверхні: церемонія сцени й телефону, пульт, «Твій приз», вітрина, перегляд). У вітрині картка монтується, коли її вперше видно (`useSeen`), тож поява грає саме тоді. Прев'ю старого `PrizeEditor` — `appear={false}`, `data-appearance="<kind>:skipped"`.

---

### Задача 1. Чистий модуль ефектів: план і частинки

**Files:**
- Create: `apps/web/src/trophy/effect-plan.ts`, `apps/web/src/trophy/effect-plan.test.ts`
- Modify: `apps/web/src/trophy/lazy.test.ts` (список «pure decor modules do not import three» + `effect-plan.ts`)

**Interfaces:**
- Consumes: `TrophyEffect` (shared), `TrophySize` (`engine-types.ts`).
- Produces:
  ```ts
  export const EFFECT_BUDGET: Record<TrophySize, number>; // { stage: 48, view: 48, phone: 32, card: 12 }
  export const GLOW_DEFAULT = '#ffd36b';
  export const PREWARM_S = 1.5;
  export type EffectMode = 'animated' | 'static' | 'off';
  export interface EffectPlan { kind: TrophyEffect; mode: EffectMode; count: number; color: string } // count 0 для glow/rays/none
  export function effectPlan(effect: { kind: TrophyEffect; color?: string }, size: TrophySize, calm: boolean): EffectPlan;
  export type ParticleKind = 'sparks' | 'fire' | 'snow';
  export interface EffectFrame { center: readonly [number, number, number]; radius: number }
  export interface Particles { kind: ParticleKind; count: number; positions: Float32Array; colors: Float32Array; velocities: Float32Array; ages: Float32Array; lives: Float32Array }
  export function mulberry32(seed: number): () => number;
  export function createParticles(kind: ParticleKind, count: number, frame: EffectFrame, rng: () => number): Particles; // уже прогріті на PREWARM_S
  export function stepParticles(p: Particles, frame: EffectFrame, delta: number, rng: () => number): void;
  ```
  Числа — з «Рішень → Ефекти». `colors` — RGB 0..1 на частинку, для адитивних згасає до 0.

- [ ] **Step 1: Тести `effect-plan.test.ts`**
  - `plan per size and motion`:
    - `effectPlan({kind:'fire'}, 'stage', false)` → `{ mode:'animated', count:48 }`; `'phone'` → 32; `'card'` → `{ mode:'static', count:12 }`;
    - calm: `fire`/`sparks`/`snow` → `mode 'off'`; `glow`/`rays` → `'static'`;
    - `none` → `'off'` скрізь.
  - `glow colour`: `{kind:'glow', color:'#4fc3f7'}` → `color '#4fc3f7'`; без кольору → `'#ffd36b'`; `{kind:'sparks', color:'#000000'}` → колір не `'#000000'` (колір лише для сяйва).
  - `particles stay in their box`: для кожного виду, `frame {center:[0,1,0], radius:1}`, 300 кроків `stepParticles(…, 1/30, …)` → кожна позиція: `snow` — `x, z ∈ [−1.4, 1.4]`, `y ∈ [0, 2.4]`; `fire` і `sparks` — `|x|, |z| ≤ 2`, `y ∈ [−0.5, 3]`.
  - `additive particles fade to black`: `sparks`: частинка з `ages[i] = lives[i] − 0.001` після кроку має колір ≈ `[0,0,0]` (до 0.05) або щойно відроджена (`ages[i] < 0.1`).
  - `snow wraps to the top`: частинка з `y = 0.001` і швидкістю вниз після кроку `0.1` має `y > 1.5`.
  - `deterministic`: дві `createParticles` з `mulberry32(7)` дають однакові `positions`.
  - `prewarmed`: `createParticles('fire', 32, …)` → не всі `ages` дорівнюють 0.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/effect-plan.test.ts apps/web/src/trophy/lazy.test.ts`
  Expected: FAIL (модуля немає).
- [ ] **Step 3: Реалізувати `effect-plan.ts`** за таблицею «Рішень → Ефекти». Відроджена частинка отримує нове `lives[i]` з діапазону виду й `ages[i] = 0`.
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25b trophy effect plan — budget per size, reduced motion, sparks/fire/snow particle simulation`

---

### Задача 2. Чистий модуль анімацій появи

**Files:**
- Create: `apps/web/src/trophy/appearance-pose.ts`, `apps/web/src/trophy/appearance-pose.test.ts`
- Modify: `apps/web/src/trophy/lazy.test.ts` (+ `appearance-pose.ts` у список без `three`)

**Interfaces:**
- Consumes: `TrophyAppearance` (shared).
- Produces: `AppearancePose`, `NEUTRAL_POSE` з «Рішень → Анімації появи», а також:
  ```ts
  export const APPEAR_SECONDS: Record<TrophyAppearance, number>; // { spin: 1.4, rise: 1.6, drop: 1.3, flash: 1.5 }
  export function appearancePose(kind: TrophyAppearance, t: number): AppearancePose; // t обрізається до [0,1]
  ```

- [ ] **Step 1: Тести `appearance-pose.test.ts`**
  - `every appearance ends neutral`: для кожного з `TROPHY_APPEARANCES` `appearancePose(kind, 1)` дорівнює `NEUTRAL_POSE`, окрім `turn` (`turn % (2π)` ≈ 0 до 1e-9). Те саме для `t = 5`.
  - `all shorter than a ceremony step`: кожне `APPEAR_SECONDS[k] · 1000 < CEREMONY_MS.step`.
  - `spin`: `t=0` → `scale 0.6`, `turn 0`; `t=1` → `turn 4π`; `turn` не спадає на 20 точках.
  - `rise`: `t=0` → `lift −2`, `clip true`, `pedestal 1`; `t=0.5` → `pedestal 1`, `−2 < lift < 0`; `t=0.9` → `pedestal ≈ 0.5`; `t=1` → `clip false`, `pedestal 0`.
  - `drop`: `t=0` → `lift 3`; `t=0.5` → `lift 0`, `squash 0.85`; найбільший `lift` на `[0.5, 0.75]` (крок 0.005) ≈ 0.35 (до 0.01); на `[0.9, 1]` `lift 0`.
  - `flash`: `t=0.1` → `visible false`, `flash ≈ 0.667`; `t=0.15` → `flash 1`, `visible true`, `scale 0.3`; `t=0.5` → `flash 0`.
  - `t below zero clamps`: `appearancePose('drop', −1)` дорівнює `appearancePose('drop', 0)`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/appearance-pose.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати `appearance-pose.ts`** за формулами з «Рішень».
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2 і `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/lazy.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25b trophy appearance poses — spin, rise from a pedestal, drop and bounce, flash`

---

### Задача 3. Stage: відсікання на вигляд, нульовий розмір не тримає цикл

**Files:**
- Modify: `apps/web/src/trophy/engine/stage.ts`
- Test: `apps/web/src/trophy/engine/stage.test.ts` (фальшивий рендерер отримує поле `clippingPlanes: []`)

**Interfaces:**
- Produces:
  ```ts
  export interface StageView { …; /** Площини відсікання цього вигляду; немає — без відсікання. */ clippingPlanes?: readonly Plane[] }
  ```
  `draw` перед `render` присвоює `renderer.clippingPlanes = view.clippingPlanes ? [...view.clippingPlanes] : NO_PLANES`, де `NO_PLANES` — спільний порожній масив. Вигляд нульового розміру не продовжує цикл: `again` стає `true` лише для вигляду, що рухається й має розмір. `ResizeObserver` і так зробить `invalidate`, коли розмір з'явиться (зауваження задачі 7 з 25a).

- [ ] **Step 1: Тести**
  - `clipping planes are per view`: вигляд A з `clippingPlanes: [new Plane(new Vector3(0,1,0), 0)]`, вигляд B без. Під час `render` A `renderer.clippingPlanes` має довжину 1, під час `render` B — 0. Перевіряти знімком у `render.mockImplementation`.
  - `a zero-size moving view does not keep the loop`: вигляд з `needsFrame() === true` і `clientWidth 0` → після кадру нового `requestAnimationFrame` немає. Подія `ResizeObserver` з розміром → кадр знову ставиться.
  - Наявні тести `stage.test.ts` проходять без змін.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/stage.test.ts`
  Expected: FAIL на двох нових.
- [ ] **Step 3: Реалізувати** зміни в `stage.ts` (поле інтерфейсу, присвоєння перед `render`, умова `again`).
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25b stage clipping planes per view; a zero-size view no longer keeps the frame loop`

---

### Задача 4. Рушій: об'єкти ефектів, спалах і постамент

**Files:**
- Create: `apps/web/src/trophy/engine/effect-meshes.ts`, `apps/web/src/trophy/engine/appearance-props.ts`, `apps/web/src/trophy/engine/effect-meshes.test.ts`

**Interfaces:**
- Consumes: `EffectPlan`, `EffectFrame`, `createParticles`, `stepParticles`, `mulberry32` (задача 1); `AppearancePose` (задача 2).
- Produces:
  ```ts
  // effect-meshes.ts
  export interface BuiltEffect { object: Object3D; /** animated: крок симуляції/пульсу; static — нічого */ update(delta: number): void; animated: boolean; dispose(): void }
  export function buildEffect(plan: EffectPlan, frame: EffectFrame, seed: number): BuiltEffect | null; // mode 'off' → null
  // appearance-props.ts
  export interface AppearanceProps { flash: Sprite; pedestal: Mesh; apply(pose: AppearancePose, radius: number): void; dispose(): void }
  export function buildAppearanceProps(frame: EffectFrame, footprint: number): AppearanceProps; // footprint = max(size.x, size.z)
  ```
  Імена об'єктів: `effect-glow`, `effect-rays` (`Sprite`), `effect-sparks`, `effect-fire`, `effect-snow` (`Points` з атрибутами `position` і `color`), `appear-flash`, `appear-pedestal`. Спільні текстури — ліниві одиночки на модуль (`dotTexture()`, `glowTexture()`, `raysTexture()`, малюються на `document.createElement('canvas')`; у node тест підмінює `document` мінімальною заглушкою або середовищем jsdom). `dispose` звільняє геометрії й матеріали, текстури — ні. `apply` ставить `flash.material.opacity = pose.flash`, `flash.visible = pose.flash > 0`, масштаб `3r·(0.5 + flash)`, `pedestal.material.opacity = pose.pedestal`, `pedestal.visible = pose.pedestal > 0`.

- [ ] **Step 1: Тести `effect-meshes.test.ts`** (`// @vitest-environment jsdom`, `getContext('2d')` підмінено заглушкою, як у `stage.test.ts`)
  - `off builds nothing`: `mode 'off'` → `null`.
  - `particles are one Points`: `fire`, `count 32` → `object` — `Points` з ім'ям `effect-fire`, `geometry.getAttribute('position').count === 32`, `material.blending === AdditiveBlending`, `depthWrite false`. `snow` → `NormalBlending`.
  - `animated moves, static stands`: `animated` `sparks`: `update(0.1)` змінює масив позицій і ставить `needsUpdate` (версія атрибута зросла). `static` → масив і версія без змін, `animated false`.
  - `glow and rays are additive and behind`: `glow` з кольором `#4fc3f7` → `Sprite` `effect-glow`, `material.color.getHexString() === '4fc3f7'`, `blending AdditiveBlending`, `depthTest false`, `renderOrder −1`, масштаб `2.6·radius`. `rays` → масштаб `3.2·radius`; `update(1)` у режимі animated повертає `material.rotation` на 0.25.
  - `glow pulses only when animated`: animated `update` по 0.1 с упродовж 1 с дає різні `opacity` в межах `[0.6, 0.9]`; static лишає `0.75`.
  - `dispose keeps shared textures`: два `buildEffect` `glow` мають ту саму `material.map`; `dispose` першого викликає `geometry.dispose` і `material.dispose`, а `map.dispose` — ні.
  - `appearance props follow the pose`: `apply(NEUTRAL_POSE, 1)` → обидва `visible false`; `apply({ …NEUTRAL_POSE, flash: 1 }, 2)` → `flash.visible`, масштаб `9` (`3·2·1.5`); `apply({ …, pedestal: 0.5 })` → `opacity 0.5`, `pedestal.position.y === 0.002`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/effect-meshes.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** `effect-meshes.ts` і `appearance-props.ts` за «Рішеннями → Ефекти». `PointsMaterial({ size, sizeAttenuation: true, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending })`. Позиції частинок у світі: `frame.center` для `x, z`, підлога — 0.
- [ ] **Step 4: Тести проходять**
  Run: команда зі Step 2 і `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/lazy.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): 25b effect meshes — glow, rays, sparks, fire and snow as one sprite or one Points each; flash and pedestal props`

---

### Задача 5. Рушій: ефект і поява на трофеї, `replayAppearance`

**Files:**
- Modify: `apps/web/src/trophy/engine-types.ts`, `apps/web/src/trophy/engine/trophy-engine.ts`
- Create: `apps/web/src/trophy/engine/trophy-engine.test.ts`

**Interfaces:**
- Consumes: `effectPlan` (задача 1), `appearancePose`, `APPEAR_SECONDS`, `NEUTRAL_POSE` (задача 2), `StageView.clippingPlanes` (задача 3), `buildEffect`, `buildAppearanceProps` (задача 4).
- Produces:
  ```ts
  // engine-types.ts
  export interface TrophyMount { …; /** грати анімацію появи при показі */ appear: boolean }
  export interface TrophyHandle { dispose(): void; /** програти появу знову; без decor, під reduced motion чи після dispose — нічого */ replayAppearance(): void }
  ```
  У `mount`:
  - `calm = reducedMotion()`;
  - `plan = effectPlan(decor.effect, size, calm)`;
  - `appearing = decor && appear && !calm`.

  Ефект і реквізит появи додаються в `scene` після `framingSphere` (кадрування їх не бачить). Сід генератора — лічильник `mount` на модуль.

  `needsFrame` = `(spinning && dragging === null) || effect?.animated || state === 'playing' || state === 'pending'`.

  `beforeRender`:
  1. `state 'pending'` → `'playing'`, годинник 0;
  2. годинник += `delta`, поза `appearancePose(kind, годинник / APPEAR_SECONDS[kind])`;
  3. `t ≥ 1` → `'done'`;
  4. поза на групу `trophy`: `position.y = lift·r`, `scale (s, s·squash, s)`, `rotation.y = yaw + turn`, `visible`;
  5. `view.clippingPlanes = clip ? [FLOOR] : undefined`, де `FLOOR = new Plane(new Vector3(0,1,0), 0)`;
  6. прозорість тіні — з «Рішень»;
  7. `effect.update(delta)`.

  `data-appearance` оновлюється при кожній зміні стану. Без `decor` — нічого з цього, і атрибутів немає.

- [ ] **Step 1: Тести `trophy-engine.test.ts`** (jsdom; `vi.mock('./models')`: `loadModel` → `Group` з одним `Mesh(BoxGeometry(0.5,1,0.5))`, `paintModel` і `framingSphere` справжні або простий stub сфери `{center:(0,0.5,0), radius:0.6}`; `vi.mock('./stage')`: `getStage` → фальшива сцена `{ add(view), remove, invalidate: vi.fn(), environment: new Texture(), lost: false }`, що зберігає `view`; `vi.mock('./decor-meshes')`: `buildDecor` → `{ group: new Group(), backdrop: null }`; `matchMedia` підмінено; кадр — ручний виклик `view.beforeRender(300, 300, delta)` і `view.afterDraw()`)
  - `no decor renders as before`: `look {kind:'cup', material:'gold'}` → немає `data-effect` і `data-appearance`; після кадрів по 0.1 с `trophy.position.y === 0`, `scale 1`; `needsFrame()` дорівнює `spin`; у сцені немає об'єктів з іменем `effect-*` чи `appear-*`.
  - `the appearance waits for the first drawn frame`: `decor {appearance:'drop', effect:{kind:'none'}}`, `appear:true`, `spin:false` → після `mount` і `ready` `data-appearance 'drop:pending'`, `needsFrame() true`; перший `beforeRender(…, 0)` → `'drop:playing'`, група на `y = 3·r`; кадри до суми 1.3 с → `'drop:done'`, `y 0`, `needsFrame() false`.
  - `spin appearance adds turns`: `appearance 'spin'`, `spin:false` → на 0.7 с `rotation.y` між 0 і 4π; після 1.4 с `rotation.y % (2π) ≈ 0`.
  - `rise clips the floor only while playing`: `'rise'` → під час гри `view.clippingPlanes` має 1 площину, `appear-pedestal` видимий. Після `'rise:done'` `clippingPlanes` `undefined`, постамент невидимий.
  - `reduced motion skips`: `matchMedia` reduce, `'flash'` → `data-appearance 'flash:skipped'`, група видима зі `scale 1` з першого кадру; `effect fire` → `data-effect 'fire:off'`, у сцені немає `effect-fire`; `needsFrame() false`.
  - `appear false skips`: `appear:false` → `'spin:skipped'`.
  - `effect in the scene, not in the trophy`: `effect {kind:'snow'}`, `size 'stage'` → `data-effect 'snow:animated'`, `effect-snow` — дитина `scene`, а не `trophy`; `needsFrame() true` після `'done'`.
  - `a card with an effect does not keep the loop`: `size 'card'`, `fire`, `spin:false`, `appear:false` → `data-effect 'fire:static'`, `needsFrame() false`.
  - `replay restarts, and is a no-op after dispose, when calm or without decor`:
    - після `'done'` `replayAppearance()` → `'playing'` (наступний кадр з `t = 0`), `stage.invalidate` викликано;
    - посеред гри — годинник знову з 0;
    - без `decor` чи під reduced motion — атрибут і `invalidate` без змін;
    - після `dispose()` — без винятку й без `invalidate`.
  - `dispose frees effect resources`: шпигуни на `dispose` геометрії й матеріалу `effect-snow` і `appear-pedestal` викликані.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/engine/trophy-engine.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** зміни `engine-types.ts` і `trophy-engine.ts`. `owned` отримує `effect` і `props` (їх `dispose`). Тип `TrophyHandle` змінився, тож у фальшивих рушіях тестів (`TrophyView.test.tsx`, `PrizeViewer.test.tsx` та інших з `mount(`) додати `replayAppearance: vi.fn()`, якщо `tsc` цього вимагає.
- [ ] **Step 4: Тести й типи**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy` і `pnpm --filter @quiz/web exec tsc --noEmit`
  Expected: PASS; tsc чисто, окрім уже наявних помилок e2e DOM, якщо вони були на `main`.
- [ ] **Step 5: Commit** `feat(web): 25b the engine draws the trophy's effect and plays its appearance once it is on screen; replayAppearance`

---

### Задача 6. `TrophyView`: `appear`, `ref` з `replayAppearance`; прев'ю старого редактора без появи

**Files:**
- Modify: `apps/web/src/trophy/TrophyView.tsx`, `apps/web/src/prizes/PrizeEditor.tsx:104`
- Test: `apps/web/src/trophy/TrophyView.test.tsx`, `apps/web/src/prizes/PrizeEditor.test.tsx`

**Interfaces:**
- Consumes: `TrophyMount.appear`, `TrophyHandle.replayAppearance` (задача 5).
- Produces:
  ```ts
  export interface TrophyViewHandle { replayAppearance(): void }
  export interface TrophyViewProps { trophy; size; spin; interactive; /** за замовчуванням true */ appear?: boolean; ref?: Ref<TrophyViewHandle> }
  ```
  `appear` іде в `mount` і в залежності ефекту (зміна перемонтовує). `useImperativeHandle(ref, () => ({ replayAppearance: () => handleRef.current?.replayAppearance() }), [])`. Поки рушія немає, це no-op. `PrizeEditor` передає `appear={false}`. Інші поверхні не змінюються: `Ceremony`, `HostCeremony` (через `Ceremony`), `PrizeViewer`, `MyPrize`, `Showcase`. `ShowcaseShelf`, `PrizePlaces` і «Мої призи» показують значок, як і зараз.

- [ ] **Step 1: Тести**
  - `TrophyView.test.tsx`:
    - `appear defaults to true`: `mount` отримав `appear: true`;
    - `appear false is passed`: `appear={false}` → `appear: false`;
    - `ref replays the appearance`: `ref` з `createRef`, після `mount` `ref.current.replayAppearance()` викликає `replayAppearance` фальшивого `handle`; до завантаження рушія виклик не кидає.
    - Наявні тести (`mounts with the full look` тощо) оновити на `appear: true` в очікуваних `options`.
  - `PrizeEditor.test.tsx`: `the preview does not play the appearance` — прев'ю монтується з `appear: false`.
- [ ] **Step 2: Запустити й переконатися, що падає**
  Run: `pnpm vitest run --maxWorkers=2 apps/web/src/trophy/TrophyView.test.tsx apps/web/src/prizes/PrizeEditor.test.tsx`
  Expected: FAIL.
- [ ] **Step 3: Реалізувати** `TrophyView.tsx` (React 19: `ref` — звичайний проп) і `PrizeEditor.tsx`.
- [ ] **Step 4: Тести, типи, збірка**
  Run:
  - `pnpm vitest run --maxWorkers=2 apps/web/src/trophy apps/web/src/prizes apps/web/src/screens/MyPrize.test.tsx apps/web/src/profile apps/web/src/pages/Prizes.test.tsx`;
  - `pnpm -r exec tsc --noEmit`;
  - `pnpm --filter @quiz/web build`.

  Expected: PASS; tsc чисто; у `apps/web/dist/assets` один `trophy-engine-*.js`, і жоден `index-*.js` не містить `WebGLRenderer` (`grep -l`).
- [ ] **Step 5: Commit** `feat(web): 25b TrophyView plays the appearance by default and exposes replayAppearance; the old prize form preview stays still`

---

### Задача 7. e2e «part 25b» і знімки

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts` (новий `it` після «part 25a», функція `trophyEffects25b()`, стиль `try { … } catch { await snapshot(); throw }`; хелпери частини 25a `COUNT_WEBGL_25A`, `opaqueCenters25a`, `isTrophyRequest`, `prize`-фабрика й гра до фіналу перевикористовуються, не копіюються)

**Interfaces:**
- Consumes: усе вище; атрибути `data-effect`/`data-appearance` (літерали в тесті, без імпорту вебмодулів).

Видимість до 25c: редактора ефектів немає, тож e2e створює призи через `POST /api/me/prizes`. Три з них ідуть на церемонію, ще два видно в прев'ю старого `PrizeEditor` (там `decor` уже показується). `seed-prize.ts` не змінюється: Ясин грааль має `effect none` і `appearance spin` і вже вручений.

- [ ] **Step 1: Написати сценарій**
  Назва: `part 25b: trophy effects and appearances — Оля's cup with fire that drops from the sky, a medal with a blue glow that flashes in, and a star with snow that rises from a pedestal play their appearance on the stage ceremony and show their effect with one WebGL context; sparks and rays show in the prize form preview; under reduced motion the glow stands still and nothing plays; a prize without decor is unchanged`.
  1. Оля (1280×720) завантажує одне PNG, намальоване в сторінці (суцільний колір 400×300), і створює через API:
     - кубок `gold`: `effect {kind:'fire'}`, `appearance 'drop'`, 1 фото на `medallion`;
     - медаль `silver`: `effect {kind:'glow', color:'#4fc3f7'}`, `appearance 'flash'`, без фото;
     - зірку `bronze`: `effect {kind:'snow'}`, `appearance 'rise'`;
     - кубок «Іскри 25b»: `sparks`, `spin`;
     - кубок «Промені 25b»: `rays`, `spin`.

     Решта полів `decor` порожні (`photos: []`, `inscriptions: []`, `stickers: []`, `frame 'none'`, `photoStyle 'normal'`, `photoPlace 'ring'`).
  2. Лобі: місця 1, 2, 3 = кубок, медаль, зірка; `isTrophyRequest` порожній на всіх сторінках.
  3. Гра (як у 25a): Петро перший, Іра друга, Богдан третій.
  4. Сцена:
     - зник `.trophy-fallback` (poll);
     - `data-effect`: місце 1 `'fire:animated'`, 2 `'glow:animated'`, 3 `'snow:animated'`;
     - для кожного місця `data-appearance` спершу `'…:playing'` або вже `'…:done'`, далі poll до `'drop:done'`, `'flash:done'`, `'rise:done'` (кожен ≤ 5 с від появи колонки);
     - `window.__webglCalls ≤ 2`;
     - два `toDataURL` полотна місця 1 з різницею 300 мс різні (вогонь рухається);
     - `haloPixels25b` медалі > 50.

     `haloPixels25b(selector)` рахує пікселі з `alpha > 30` у смузі `x ∈ [0.08w, 0.2w]`, `y ∈ [0.35h, 0.65h]` 2D-полотна, тобто поза силуетом медалі.
     Знімки: `p25b-stage-appearing` одразу після появи колонки 1, `p25b-stage-ceremony` після `'drop:done'`.
  5. Телефон Петра: «Твій приз» (`card`) — `data-effect 'fire:static'`, `data-appearance` доходить до `'drop:done'`. Перегляд «Кубок» (`view`) — `'fire:animated'`. Знімки `p25b-phone-myprize`, `p25b-viewer`.
  6. Оля, «Мої призи»: відкрити старий редактор «Іскри 25b» і «Промені 25b». Прев'ю `data-effect` `'sparks:static'` і `'rays:static'`, `data-appearance` `'spin:skipped'`. Знімки `p25b-form-sparks`, `p25b-form-rays`.
  7. Контекст `reducedMotion: 'reduce'`, публічна вітрина Петра (`shelf-cup` → перегляд): `data-effect 'fire:off'`, `data-appearance 'drop:skipped'`. Спершу poll, доки два кадри (`toDataURL`) поспіль не стануть однаковими, далі два кадри з різницею 1 с однакові. Окремо медаль Іри так само: `'glow:static'`, `'flash:skipped'`, кадри однакові. Знімок `p25b-calm-viewer`.
  8. `expect(problems).toEqual([])`.
- [ ] **Step 2: Збірка й прогін**
  Run: `pnpm build`, далі `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25b"`
  Expected: PASS; 7 знімків `p25b-*` в `apps/server/e2e/artifacts/shots/`.
- [ ] **Step 3: Регресія сусідніх частин**
  Run: `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 25a|part 14a|part 23a"`
  Expected: PASS. 25a не змінюється: його `data-decor` і рівність кадрів під reduced motion лишаються. Кубок 25a має `appearance 'spin'` і `effect none`, тож на сцені тепер грає обертання появи. Перевірка 25a чекає на `.trophy-fallback`, а не на позу, тож проходить.
- [ ] **Step 4: Переглянути знімки очима**
  - Вогонь біля основи кубка, не закриває медальйон.
  - Блакитне гало навколо медалі без чорного квадрата.
  - Сніжинки падають у кадрі, не тільки над кубком.
  - На `p25b-stage-appearing` кубок ще у повітрі або підстрибує.
  - Іскри й промені в прев'ю видно.
  - Під reduced motion гало стоїть, частинок немає.

  Розбіжності з «Рішеннями» виправляти в коді, не в тестах.
- [ ] **Step 5: Повний набір**
  Run: `pnpm vitest run --maxWorkers=2 apps/web` і `pnpm vitest run --maxWorkers=2 packages`
  Expected: PASS (`packages` без змін).
- [ ] **Step 6: Commit** `test(e2e): part 25b trophy effects and appearances on the ceremony, phone, viewer and form preview, still under reduced motion`
