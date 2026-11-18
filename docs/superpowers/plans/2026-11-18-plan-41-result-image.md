# План 41: підсумок гри картинкою (38c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Версія стану: `GAME_STATE_VERSION` лишається 22 (БЕЗ підвищення).** Стан гри не змінюється взагалі. Нове на сервері — лише необов'язкові ключі у відповідях: `HostView.newAchievements?` (зріз пульта, рахує сервер із `room.newAchievements`, як для сцени) і `GameDetail.result?` (відповідь історії, з наявних таблиць `prize_award` і `user_achievement`, **без міграції**).

> **Звірка з кодом.** План спирається на `main` 2026-11-18 (`c5f4d179`, після плану 40):
> - диплом: `apps/web/src/trophy/diploma.ts` — `DISPLAY`/`BODY` (Unbounded Variable / Onest Variable), `kyivDate` (~66, приватна), `wrap(context, text, width)` (~118, приватна), `diplomaFileName` (~111, `[^\p{L}\p{N}]+` → `-`), `renderDiploma` (`document.fonts?.ready`, `canvas.toBlob(…, 'image/png')`), `shareDiploma(blob, fileName)` (~200: `canShare({ files })` → `share`, `AbortError` — не помилка, інакше `<a download>` + `revokeObjectURL` через 1 с); тест — `diploma.test.ts` (підмінний контекст через `vi.spyOn(HTMLCanvasElement.prototype, 'getContext')`, `toBlob`); виклики — `profile/Showcase.tsx` ~11 (`downloadDiploma`), `screens/MyPrize.tsx` ~25; помилка — `t('diplomaFailed')` під кнопкою з `role="alert"`;
> - назва вікторини на телефоні: `useQuizTitle(code, enabled)` (`screens/MyPrize.tsx` ~98, через `checkCode`); у `PlayerScreen` ~747 увімкнено лише для `prizes.mine`;
> - телефон, `finished`: `PlayerScreen.tsx` ~1854 (`{place}` = `t('yourPlace', { rank: me.rank, total: view.playerCount })` ~929; `ceremony` з `useCeremony`; `<NewAchievements mine={view.newAchievements} />` лише при `ceremony === null`; `view.standings` — повна таблиця на `finished`, `WITH_STANDINGS` у `engine/src/views.ts` ~274); у командній грі `me` — зріз команди (`me.id` = id команди, рядки `standings` — команди);
> - пульт, `finished`: `HostScreen.tsx` ~1481 (`section.panel` з `<Standings>`, `PrizeResults`, `HostCeremony`, `FactCards`, кнопка «Нагороди на сцені»); `HostScreen` має `code` у props (~260);
> - дані зрізу: `Standing` (`packages/shared/src/standing.ts`: `nickname`, `score`, `rank` — нічия ділить місце, `engine/src/ranking.ts`), `PrizesView.places: PrizeShown[]` (`place`, `content.trophy`, `winner: { name, members } | null` — лише у `finished`; `packages/shared/src/prizes.ts` ~130), `PlayerView.newAchievements?: NewAchievementsMine` (`{ account, ids }`), `StageView.newAchievements?: NewAchievementsStage` (`{ people: { nickname, ids }[] }`, антидосягнення тих, хто ховає, прибрано); **пульт досягнень не має** — лише `HostView.awardsExtra?: true` (`apps/server/src/rooms/manager.ts` ~1447–1449, `newAchievementsStage` з `rooms/achievements.ts`); тест-заборона — `rooms/manager.achievements.test.ts` ~61;
> - значки: `ACHIEVEMENT_ICONS` (`apps/web/src/achievement-meta.ts`), назви `t(\`achievement_${id}\`)`, `isAnti`/`ACHIEVEMENT_INFO[id].goal` (`packages/shared/src/achievements.ts`); кубки — `TROPHY_EMOJI`, `trophyLabel` (`trophy/trophy-meta.ts`);
> - історія: сторінка `apps/web/src/pages/GameHistory.tsx` ~320 (`getGame(id)` через `usePrivateData`, заголовок `h1.brand` + `p.meta` з `formatDate(game.startedAt)`), маршрут `/history/:id`, бачить **лише ведучий** (`hostGameWithFacts`, `apps/server/src/history.ts` ~600, повертає `detail` ~750–783); `GameDetail` (`packages/shared/src/history.ts`): `title`, `status`, `startedAt`, `finishedAt`, `teams`, `standings: GameStanding[]` (`nickname`, `score`, `rank: number | null`, `members?`); **призів і досягнень у відповіді немає**, але в базі є: `prize_award` (`game_id`, `place`, `content`, `nickname`, лише гравці з акаунтом), `user_achievement` (`game_id` — гра, де здобуто вперше), `participant` (`game_id`, `user_id`, `nickname`), `profile.hide_anti` (`antiHidden(db, userIds)` в `apps/server/src/achievement-store.ts` ~462);
> - тести історії — `apps/server/src/history.test.ts` (справжня база через `buildApp`, `signUp`);
> - i18n: останній список — `ADDED_STAGE_SOUNDS` (`apps/web/src/i18n.test.ts` ~189, перевірка локалей ~408, умова `adds no uk keys…` ~462); `appName: 'Вікторина'` (`i18n.ts` ~9);
> - діалог-зразок: `apps/web/src/prizes/tools/CropDialog.tsx` (`role="dialog" aria-modal="true"`, Escape і пастка Tab на документі);
> - e2e-зразки: `part13-16-…e2e.ts` ~578 (`noShare` — прибрати `canShare` в init-скрипті), ~771 (`waitForEvent('download')`, перевірка підпису PNG), `part25-trophies.e2e.ts` ~227 (приз через `POST ${base}/api/me/prizes`), `part40-stage-sounds.e2e.ts` (`useE2eServer`, `snapshot`, `shot`, світла тема через `quiz:theme`), `register`, `expectNoSideScroll`, `expectPhoneFit` (`helpers/common.ts`).
>
> **Перед кожною задачею виконавець звіряє назви й рядки з кодом.** Розбіжність — привід міняти назви й рядки, не рішення плану.

**Мета:** кнопка «📸 Підсумок картинкою» на фінальному екрані телефона, на пульті після кінця гри й на сторінці минулої гри в історії малює в браузері PNG 1080×1350 (назва вікторини й дата, п'єдестал, «Моє місце», кубки, досягнення, назва додатку й адреса), показує прев'ю й ділиться ним через Web Share або завантажує файл.

**Архітектура:** спільне з диплома (шрифти, дата за Києвом, перенос рядків, безпечне ім'я файлу, «поділитися або завантажити») виноситься в `apps/web/src/share-image.ts`; диплом користується ним без зміни поведінки. Картинка — три шари: чисті будівники `ResultImageData` з трьох джерел (зріз телефона, зріз пульта, `GameDetail`), чиста розкладка `resultLayout(data, measure) → DrawOp[]` (усі координати й обрізання тут, тестується без canvas), і тонкий `renderResultImage` (виконує операції на canvas 1080×1350). UI — `ResultImageButton` + модальне `ResultPreview`.

**Технології:** TypeScript, React 19 + Vite + Testing Library (jsdom), Canvas 2D, Web Share API Level 2, Fastify + drizzle (історія), Playwright через vitest (e2e).

**Специфікація:** `docs/superpowers/specs/2026-11-18-result-image-design.md` (38c) — уся.

## Глобальні обмеження

- **`GAME_STATE_VERSION` лишається 22** (`packages/engine/src/restore.ts`). Стан гри не змінюється; якщо виконавцю здасться, що потрібне поле стану, — **зупинитися й спитати контролера**.
- Усі тексти — у 7 мовах: uk (`apps/web/src/i18n.ts`) + `apps/web/src/locales/{en,de,es,it,pl,ar}.json`. Нові uk-ключі — у новому списку `ADDED_RESULT_IMAGE` у `apps/web/src/i18n.test.ts`; він — в умові `adds no uk keys beyond the agreed list` і в перевірці наявності в усіх локалях (як `ADDED_STAGE_SOUNDS`). Множин немає. ru немає. Тексти довідки не змінюються (якщо все ж зачеплено — `help-uk.ts` + golden + `*.help.json`).
- Кириличні літерали в `apps/web/src` — лише в словниках і тестах (`source-scan.test.ts`).
- **Приватність:** на картинці й у новому полі історії — лише нікнейми (назви команд) і бали; **жодних email, аватарів Google, імен акаунтів, user id**.
- **Нічого, пов'язаного з росією**, — у фікстурах, назвах вікторин і нікнеймах тестів.
- Картинка завжди однакова (світла святкова) незалежно від теми додатку; мова картинки — мова інтерфейсу.
- Тести — завжди `--maxWorkers=2`: `pnpm test --project <shared|engine|server|web> --maxWorkers=2 [шляхи]`; типи — `pnpm typecheck`. **Ніколи не запускати prettier.**
- **Команди тестів, збирання й e2e — лише на передньому плані й ніколи дві одночасно** (без `run_in_background`, без паралельних викликів).
- e2e: нова частина 41 у `apps/server/e2e`; спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 41"`; кадри — з `E2E_SHOTS=1`. Телефон 360 px, пульт, світла тема, прев'ю відкривається, PNG має 1080×1350.
- Таймери запитань у фікстурах e2e ≥ 25 с.

## Рішення плану (там, де специфікація мовчить)

**Звідки кожен блок на кожному екрані**

| Блок | Телефон (`PlayerView`, `finished`) | Пульт (`HostView`, `finished`) | Історія (`GameDetail`) |
|---|---|---|---|
| Назва | `useQuizTitle(code, phase === 'finished')` | `useQuizTitle(code, phase === 'finished')` | `title` |
| Дата | `new Date()` (як диплом) | `new Date()` | `finishedAt ?? startedAt` |
| П'єдестал | `view.standings` | `view.standings` | `standings` (рядки з `rank !== null`) |
| «Я» | `me.id`/`me.rank` проти `standings` | — | — (сторінку бачить лише ведучий) |
| Кубки | `view.prizes.places` з `winner !== null` | те саме | **нове** `result.prizes` |
| Досягнення | `view.newAchievements.ids` (свої) | **нове** `view.newAchievements.people` | **нове** `result.achievements` |

- Назва ще не прийшла (`''`) — рядок назви не малюється, кнопка не чекає.
- Немає даних для блоку — блок не малюється й місця не займає (наступний блок піднімається).

**Нові поля сервера (без міграції)**
- `HostView.newAchievements?: NewAchievementsStage` (doc «Нові досягнення кімнати (38c), як у сцени; ставить сервер; немає — ніхто нічого не отримав») — у `manager.view` для пульта той самий `slide`, що й для сцени, **поряд** з `awardsExtra: true` (кнопка «Нагороди на сцені» не змінюється).
- `GameDetail.result?: GameResultExtras` (doc «Для картинки підсумку (38c): кубки й нові досягнення гри; лише status 'finished'»):
  ```ts
  export interface GameResultExtras {
    /** Вручені призи (prize_award цієї гри) за місцем 1→3; кілька людей одного місця (команда) — одним рядком. Гості в prize_award не потрапляють. */
    prizes: { place: PrizePlace; trophy: TrophyLook | null; winners: string[] }[];
    /** Досягнення, здобуті вперше в цій грі (user_achievement.game_id), з нікнеймом учасника цієї гри; антидосягнення тих, хто їх ховає (hide_anti), прибрано. Порядок людей — як у standings. */
    achievements: { nickname: string; ids: AchievementId[] }[];
  }
  ```
  `trophy` — без `decor` (`{ kind, material }`), ніяких інших полів призу. Ключ є лише для `status === 'finished'`; обидва масиви можуть бути порожні.

**П'єдестал і «Я»**
- `podiumOf(rows)` — рядки з `rank !== null && rank <= 3` у порядку таблиці, **не більше 5** (нічия ділить місце: `1, 1, 3` — три рядки з медалями 🥇🥇🥉). Медаль за `rank`: 1 → 🥇, 2 → 🥈, 3 → 🥉. Команди — назва команди (`nickname` рядка), склад не малюється.
- «Я» — лише на телефоні, коли свого рядка немає в `podiumOf`: `{ place: row.rank, total: standings.length, score: row.score }`; рядок шукається за `me.id`. Немає рангу — блоку немає.

**Досягнення**
- Телефон: свої `ids` у порядку зрізу (звичайні, потім анти — так їх уже впорядкував сервер), перші 4, решта — «+ ще K»; нікнейм не малюється. Гість (`account: false`) — блоку немає.
- Пульт та історія — `pickHighlights(people, 4)`: спершу звичайні, потім анти; серед звичайних — разові (`ACHIEVEMENT_INFO[id].goal === null`) перед лічильними (`games_10` тощо); далі **по колу між людьми** (перше найкраще кожного, потім друге…), щоб на картинці були різні люди; за рівності — порядок каталогу `ACHIEVEMENTS`. Кожен рядок — значок, назва, нікнейм. Решта — «+ ще K».

**Кубки**
- Рядок на місце (1→3): `TROPHY_EMOJI[trophy.kind]` (без трофея — 🎁), `trophyLabel(trophy)` (без трофея — нічого), `→ ` + імена (`winner.name`; у командах — назва команди; в історії — `winners.join(', ')`). Емодзі, не 3D-картинка (без CORS і без WebGL).

**Розкладка** (canvas 1080×1350, тло `#FFF8EC` з тонкою золотою рамкою `#C9A227`, текст `#2B2340`, другорядне `#6B6380`; точні кольори — на розсуд виконавця в межах контрасту ≥ 4.5:1 до тла)
- Поля 72 px; ширина тексту `1080 − 2·72 = 936`.
- Назва: `700 64px DISPLAY`, по центру, ≤ 2 рядки (`wrapText`), якщо слів більше — другий рядок обрізається `fitLine` з «…»; дата `400 34px BODY` під назвою.
- П'єдестал: рядок на учасника, `600 52px BODY` для 1-го місця, `48px` для решти; медаль ліворуч, нік (обрізання «…» до ширини), бали праворуч (`num(score)`).
- «Я»: `t('resultImageMe', { place, total, score: num(score) })`, `500 40px BODY`, на світлій плашці.
- Кубки: заголовок `t('resultImagePrizes')`, до 3 рядків `40px`.
- Досягнення: заголовок `t('resultImageAchievements')`, до 4 рядків `36px` («🏅 Назва · Нік»), «+ ще K» — `t('resultImageMore', { count })`.
- Низ: `${t('appName')} · ${site}` (`site` = `location.host`), `400 28px BODY`, `#6B6380`, на `y = 1350 − 60`.
- Блоки йдуть зверху вниз з відступом 48 px; якщо наступний блок не влазить вище за низ (`y > 1350 − 120`), **блок пропускається цілком** (ніколи не перекриває низ).
- Арабська: `direction = 'rtl'`, коли `document.dir === 'rtl'`; рядки з медаллю й балами дзеркалюються (медаль праворуч, бали ліворуч).

**Ім'я файлу й поділитися**
- `resultFileName(title)` = `safeFileName('pidsumok', title)` → `pidsumok-<назва>.png`; порожня назва — `pidsumok.png`.
- `sharePng(blob, name, title)` — тіло нинішнього `shareDiploma` з параметром заголовка; `shareDiploma(blob, name)` = `sharePng(blob, name, t('diplomaTitle'))`.
- Прев'ю: кнопка малює картинку (кнопка `disabled` на час малювання), відкриває діалог `role="dialog" aria-modal="true"` з заголовком `t('resultImageTitle')`, `<img alt={t('resultImageAlt')}>` (object URL, `revokeObjectURL` на закритті), кнопками «Поділитися» (лише коли `canShareFile(file)`), «Завантажити» (завжди, `downloadPng`), «Закрити» (і Escape, і дотик тла). Фокус — на «Поділитися» чи «Завантажити»; після закриття — назад на кнопку. Скасування шерингу — діалог лишається відкритим без помилки. Помилка малювання — `t('resultImageFailed')` під кнопкою (`role="alert"`), діалог не відкривається.

**Тексти (uk)** — `ADDED_RESULT_IMAGE`:
`resultImageButton: '📸 Підсумок картинкою'`, `resultImageTitle: 'Підсумок гри'`, `resultImageAlt: 'Картинка з підсумком гри'`, `resultImageShare: 'Поділитися'`, `resultImageDownload: 'Завантажити'`, `resultImageClose: 'Закрити'`, `resultImageFailed: 'Не вдалося створити картинку.'`, `resultImageMe: 'Моє місце: {place} з {total} · {score}'`, `resultImagePrizes: 'Кубки'`, `resultImageAchievements: 'Досягнення'`, `resultImageMore: '+ ще {count}'`.

**Де кнопки**
- Телефон: одразу після `{place}` у блоці `finished`, лише коли `ceremony === null` і `view.standings` непорожня; `className="btn result-image-button"`.
- Пульт: у `section.panel` після `<Standings>`, коли `view.standings.length > 0`.
- Історія: під рядками `p.meta` заголовка, лише `status === 'finished'` і `standings.length > 0`.
- Сцена — без кнопки.

## Порядок збирання

- Залежності: 2 — незалежна; 3 ← 1, 2 (типи); 4 ← 1, 3; 5 ← 4; 6 ← 2, 3, 5; 7 — остання.
- Усі нові поля необов'язкові, тож `pnpm typecheck` зелений після кожної задачі.

## Фокус рев'ю

1. **Довгі й незвичні тексти.** Назва на 200 символів з одним довгим словом без пробілів, нік на 40 символів з емодзі, арабська мова — нічого не виходить за 936 px, «…» на місці, низ не перекрито. Задача 3.
2. **Нічия й мало учасників.** Один гравець; двоє з однаковими балами (обидва 🥇); `1, 2, 2, 2, 5` (чотири рядки); я на 4-му місці при нічиїй за 3-тє — я в п'єдесталі, «Я» не малюється. Задачі 3, 4.
3. **Приватність.** Нове поле історії й зріз пульта не несуть email, user id, аватарів; досягнення людини з `hide_anti` без антидосягнень; гравці без акаунта відсутні в досягненнях історії. Задачі 2, 7.
4. **Шеринг.** `canShare` немає (десктоп, Firefox) — лише «Завантажити»; `share` відхилено з `AbortError` — без помилки, діалог відкритий; `NotAllowedError` — завантаження; object URL відкликано після закриття. Задачі 1, 5.
5. **Фінальний екран не ламається.** Кнопка не з'являється під час церемонії призів; на 360 px без бокового скролу в обох темах; старий сервер без `newAchievements` у пульта й без `result` в історії — блоки просто відсутні. Задачі 6, 7.

---

### Задача 1. Веб: спільні шматки картинок із диплома (`share-image.ts`)

**Files:**
- Create: `apps/web/src/share-image.ts`, `apps/web/src/share-image.test.ts`
- Modify: `apps/web/src/trophy/diploma.ts` — прибрати `DISPLAY`, `BODY`, `kyivDate`, `wrap`, тіло `shareDiploma` і регулярку `diplomaFileName`, імпортувати з `share-image.ts`; публічний інтерфейс `diploma.ts` (`diplomaLines`, `diplomaFileName`, `renderDiploma`, `shareDiploma`, `contrast`, `diplomaFrame`) не змінюється.

**Interfaces (Produces):**
```ts
export const IMAGE_FONTS: { display: string; body: string }; // ті самі рядки, що DISPLAY/BODY диплома
/** dd.mm.yyyy за київським часом (Europe/Kyiv, запасне Europe/Kiev). */
export function kyivDate(date: Date): string;
/** Слова в рядки, що влазять у width (довге слово — окремим рядком, як було). */
export function wrapText(context: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number): string[];
/** Рядок, обрізаний до width з «…» в кінці; влазить — без змін. */
export function fitLine(context: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number): string;
/** <prefix>-<безпечна назва>.png; усе, крім літер і цифр, — дефіс; порожньо — <prefix>.png. */
export function safeFileName(prefix: string, name: string): string;
/** canvas → PNG Blob; null від toBlob — Error('canvas_unavailable'). */
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob>;
export function canShareFile(file: File): boolean;
export function downloadPng(blob: Blob, fileName: string): void;
/** canShareFile → share({ files, title }); AbortError — 'shared'; інша відмова чи немає Web Share — downloadPng, 'downloaded'. */
export function sharePng(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded'>;
```

- [ ] **Step 1: Write the failing tests** (`share-image.test.ts`, `// @vitest-environment jsdom`; вимір — `{ measureText: (s) => ({ width: s.length * 10 }) }`):
  - `kyivDate shows the Kyiv day` — `new Date('2026-12-31T22:30:00Z')` → `'01.01.2027'`.
  - `wrapText splits on spaces within the width` — `'один два три'`, 80 → `['один два', 'три']`.
  - `fitLine adds an ellipsis only when too long` — `'Оля'`, 100 → `'Оля'`; `'Олександра'`, 60 → рядок закінчується на `'…'` і `length * 10 <= 60`; одне слово без пробілів на 200 символів, 936 → ширина ≤ 936.
  - `safeFileName keeps letters and digits` — `('pidsumok', 'Зимова вікторина 2026!')` → `'pidsumok-Зимова-вікторина-2026.png'`; `('pidsumok', ' ?! ')` → `'pidsumok.png'`; `('dyplom', 'Оля')` → `'dyplom-Оля.png'`.
  - `sharePng shares a png file with the title` — заглушки `navigator.canShare → true`, `share` (spy) → `'shared'`, у `share` — `files[0].name === 'a.png'`, `files[0].type === 'image/png'`, `title === 'T'`.
  - `sharePng treats AbortError as done` — `share` відхиляє `new DOMException('x', 'AbortError')` → `'shared'`, `<a download>` не клікнуто.
  - `sharePng downloads without Web Share or on another refusal` — без `canShare` → `'downloaded'`, клік по `a[download="a.png"]` (spy на `HTMLAnchorElement.prototype.click`), посилання прибрано з DOM; `NotAllowedError` → `'downloaded'`.
  - `canShareFile is false when canShare is missing or throws`.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/share-image.test.ts`. Expected: FAIL (модуля немає).
- [ ] **Step 3: Implement** `share-image.ts` (перенесення з `diploma.ts` + `fitLine` бінарним пошуком довжини, `canShareFile` у `try`), переписати `diploma.ts` на нього.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/share-image.test.ts apps/web/src/trophy/diploma.test.ts apps/web/src/profile apps/web/src/screens/MyPrize.test.tsx && pnpm typecheck`. Expected: PASS (тести диплома без змін).
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/share-image.ts apps/web/src/share-image.test.ts apps/web/src/trophy/diploma.ts
git commit -m "refactor(web): 41 result image — fonts, the Kyiv date, line wrapping, an ellipsis fit, safe file names and share-or-download move out of the diploma into a shared module"
```

---

### Задача 2. Спільне й сервер: досягнення кімнати для пульта, кубки й досягнення в історії

**Files:**
- Modify: `packages/shared/src/views.ts` — `HostView.newAchievements?: NewAchievementsStage` (після `awardsExtra?`); `packages/shared/src/history.ts` — `GameResultExtras` і `GameDetail.result?: GameResultExtras` (типи з «Рішень»).
- Modify: `apps/server/src/rooms/manager.ts` ~1449 — пульт: `...(slide === undefined ? {} : { awardsExtra: true, newAchievements: slide })`.
- Modify: `apps/server/src/history.ts` — у `hostGameWithFacts` для `row.status === 'finished'`: два запити (`prize_award` за `game_id`, `user_achievement` за `game_id` ⨝ `participant` за `(game_id, user_id)` для нікнейму) + `antiHidden(db, userIds)`; `result` у `detail`.
- Test: `apps/server/src/rooms/manager.achievements.test.ts`, `apps/server/src/history.test.ts`.

**Interfaces (Produces):** `HostView.newAchievements`, `GameDetail.result` — як у «Рішеннях».

- [ ] **Step 1: Write the failing tests:**
  - `manager.achievements.test.ts` ~61: замінити заборону на `the host gets the room achievements like the stage` — після `setNewAchievements` пульт має `newAchievements` рівний сценовому `{ people: [{ nickname: 'Оля', ids: ['fast_answer', 'in_debt'] }] }` і `awardsExtra: true`; до нагородження — ключа немає; антидосягнення людини з `hideAnti` прибрано (як у сцени).
  - `history.test.ts`, новий `describe('game result extras (38c)')` (зіграти гру зі збереженням, як у сусідніх тестах; рядки `prize_award`/`user_achievement`/`profile` вставити напряму):
    - `a finished game lists the awarded prizes by place` — два рядки `prize_award` (місце 2 — `{ kind: 'medal', material: 'silver', decor: … }`, місце 1 — `cup`/`gold`) → `result.prizes` = `[{ place: 1, trophy: { kind: 'cup', material: 'gold' }, winners: ['Оля'] }, { place: 2, trophy: { kind: 'medal', material: 'silver' }, winners: ['Петро'] }]` (без `decor`, без `name`, `engraving`, `real`).
    - `two members of one team share a prize line` — два `prize_award` місця 1 → `winners: ['Оля', 'Іра']`.
    - `achievements earned in this game with the game nickname` — `user_achievement` з цим `game_id` → `{ nickname: <нік участі>, ids }` у порядку `standings`; ачівки з іншим `game_id` чи `null` — не входять; антидосягнення людини з `profile.hide_anti = true` прибрано, людина з самими анти — не входить.
    - `no result key for an aborted or saved game`; `an old finished game has empty lists`.
    - `no private fields` — `JSON.stringify(detail.result)` не містить email і `user_id` тестових акаунтів.
- [ ] **Step 2: Run** `pnpm test --project server --maxWorkers=2 apps/server/src/rooms/manager.achievements.test.ts apps/server/src/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm test --project server --maxWorkers=2 && pnpm test --project shared --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/views.ts packages/shared/src/history.ts apps/server/src/rooms/manager.ts apps/server/src/history.ts apps/server/src/rooms/manager.achievements.test.ts apps/server/src/history.test.ts
git commit -m "feat(server): 41 result image — the host view carries the room achievements like the stage, a finished game in the history lists its awarded prizes and the achievements first earned in it, nicknames only, no migration"
```

---

### Задача 3. Веб: дані картинки, розкладка й тексти (`result-image/data.ts`, `result-image/layout.ts`)

**Files:**
- Create: `apps/web/src/result-image/data.ts`, `apps/web/src/result-image/data.test.ts`, `apps/web/src/result-image/layout.ts`, `apps/web/src/result-image/layout.test.ts`
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/locales/{en,de,es,it,pl,ar}.json`, `apps/web/src/i18n.test.ts` — тексти з «Текстів (uk)» і `ADDED_RESULT_IMAGE`

**Interfaces:**
- Consumes: `IMAGE_FONTS`, `kyivDate`, `wrapText`, `fitLine` (задача 1); `GameDetail.result`, `HostView.newAchievements` (задача 2).
- Produces:
```ts
// data.ts
export interface ResultImageData {
  quizTitle: string;            // '' — рядка немає
  date: Date;
  podium: { place: number; name: string; score: number }[];
  me: { place: number; total: number; score: number } | null;
  prizes: { place: PrizePlace; trophy: { kind: TrophyKind; material: TrophyMaterial } | null; winners: string[] }[];
  achievements: { id: AchievementId; nickname: string | null }[]; // уже вибрані, ≤ 4
  moreAchievements: number;
  site: string;
}
export function podiumOf(rows: { nickname: string; score: number; rank: number | null }[]): ResultImageData['podium'];
export function pickHighlights(people: { nickname: string; ids: AchievementId[] }[], max: number): { picked: { id: AchievementId; nickname: string }[]; more: number };
export function resultFromPlayer(view: PlayerView, quizTitle: string, now: Date, site: string): ResultImageData;
export function resultFromHost(view: HostView, quizTitle: string, now: Date, site: string): ResultImageData;
export function resultFromHistory(game: GameDetail, site: string): ResultImageData;
// layout.ts
export const RESULT_SIZE = { width: 1080, height: 1350 } as const;
export type DrawOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { kind: 'frame'; x: number; y: number; w: number; h: number; stroke: string; line: number }
  | { kind: 'text'; text: string; x: number; y: number; font: string; fill: string; align: CanvasTextAlign; block: ResultBlock };
export type ResultBlock = 'title' | 'date' | 'podium' | 'me' | 'prizes' | 'achievements' | 'footer';
export function resultLayout(data: ResultImageData, measure: (font: string, text: string) => number, rtl: boolean): DrawOp[];
export function resultFileName(quizTitle: string): string; // safeFileName('pidsumok', quizTitle)
```
`resultLayout` бере тексти через `t()` (мова інтерфейсу), значки — `ACHIEVEMENT_ICONS`, назви — `t(\`achievement_${id}\`)`, кубки — `TROPHY_EMOJI`/`trophyLabel`; значення — з «Розкладки». `measure` дає ширину тексту в шрифті (у тестах — `text.length * px * 0.5`).

- [ ] **Step 1: Write the failing tests:**
  - `data.test.ts`:
    - `podiumOf keeps ranks 1 to 3 and ties` — ранги `[1, 1, 3, 4]` → три рядки з місцями `1, 1, 3`; `[1, 2, 2, 2, 2, 2, 7]` → п'ять рядків; `rank: null` — пропущено; один гравець — один рядок.
    - `resultFromPlayer adds me outside the podium` — я 5-й з 6 → `me = { place: 5, total: 6, score }`; я 2-й → `me: null`; нічия за 3-тє, я 4-й рядок з `rank: 3` → `me: null`.
    - `resultFromPlayer in a team game uses team rows` — `standings` команд, `me.id` = id команди → `podium[].name` = назви команд, «Я» — місце команди.
    - `resultFromPlayer takes own achievements, four and more` — `newAchievements: { account: true, ids: [6 штук] }` → 4 з `nickname: null`, `moreAchievements: 2`; `{ account: false, ids: [] }` чи немає ключа → `[]`, `0`.
    - `prizes take only places with a winner` — `places` з `winner: null` на місці 3 → лише 1 і 2; `winners: [winner.name]`; без `view.prizes` → `[]`.
    - `pickHighlights mixes people and puts one-off before counters and anti last` — Оля `['games_10', 'sniper', 'in_debt']`, Петро `['fast_answer']` → `picked` = `[{ sniper, Оля }, { fast_answer, Петро }, { games_10, Оля }, { in_debt, Оля }]`, `more: 0`; 7 різних → 4 і `more: 3`.
    - `resultFromHost uses room achievements and has no me` — `me: null`; без `newAchievements` — `[]`.
    - `resultFromHistory` — дата з `finishedAt` (немає — `startedAt`), `podium` зі `standings`, `prizes` і `achievements` з `result`; без `result` — порожні блоки.
  - `layout.test.ts` (`measure = (font, text) => text.length * parseInt(/(\d+)px/.exec(font)![1]) * 0.5`):
    - `draws the blocks top to bottom` — повні дані → `block` текстових операцій іде в порядку `title, date, podium, me, prizes, achievements, footer`; є `'🥇'`; низ = `'Вікторина · quiz.example'` на `y === 1290`.
    - `a long title wraps to two lines with an ellipsis` — назва з 30 слів → рівно 2 операції `block: 'title'`, друга закінчується на `'…'`, кожна ширина ≤ 936.
    - `long nicknames are cut to the row` — нік із 60 літер → текст з `'…'`, ширина ≤ місця між медаллю й балами.
    - `ties show the same medal` — `podium` `1, 1, 3` → медалі `'🥇', '🥇', '🥉'`.
    - `me line` — `me = { place: 5, total: 6, score: 1200 }` → є текст `'Моє місце: 5 з 6 · 1 200'` (через `num`, звірити з `format.ts`); `me: null` → жодної операції `block: 'me'`.
    - `empty blocks take no space` — без `prizes` і `achievements`: немає їх заголовків; `quizTitle: ''` → немає `title`, дата — першим текстом.
    - `more achievements` — `moreAchievements: 3` → `'+ ще 3'`.
    - `nothing goes below the footer` — 5 рядків п'єдесталу, «Я», 3 кубки, 4 досягнення → кожна операція, крім `footer`, має `y ≤ 1350 − 120`; блок, що не влазить, відсутній цілком.
    - `right to left mirrors medal rows` — `rtl: true` → медаль має `x` більший за бали.
    - `resultFileName` — `'Зимова вікторина'` → `'pidsumok-Зимова-вікторина.png'`, `''` → `'pidsumok.png'`.
  - `i18n.test.ts`: `ADDED_RESULT_IMAGE` у всіх 7 мовах.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image apps/web/src/i18n.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** за Interfaces і «Рішеннями». **Усі тексти — у цій задачі:** ключі з «Текстів (uk)» у `i18n.ts`, ті самі ключі в шести локалях і список `ADDED_RESULT_IMAGE` в `i18n.test.ts` (у списку, у перевірці локалей і в умові `adds no uk keys…`), інакше `i18n.test.ts` упаде на uk-ключах без списку.
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/result-image apps/web/src/i18n.ts apps/web/src/locales apps/web/src/i18n.test.ts
git commit -m "feat(web): 41 result image — data from the phone, the host and the history, a podium with ties, my place outside the top three, highlighted achievements, a 1080×1350 layout with wrapped titles, cut nicknames and no block below the footer, texts in 7 languages"
```

---

### Задача 4. Веб: малювання на canvas (`result-image/render.ts`)

**Files:**
- Create: `apps/web/src/result-image/render.ts`, `apps/web/src/result-image/render.test.ts`

**Interfaces:**
- Consumes: `resultLayout`, `RESULT_SIZE` (задача 3), `canvasPng` (задача 1).
- Produces: `export async function renderResultImage(data: ResultImageData): Promise<Blob>;` — `await document.fonts?.ready`, canvas `1080×1350`, `getContext('2d')` null → `Error('canvas_unavailable')`, `direction` за `document.dir`, `measure` через `context.font = …; context.measureText(text).width`, виконує операції по черзі (`rect` → `fillRect`, `frame` → `strokeRect`, `text` → `font`/`fillStyle`/`textAlign`, `fillText`), `textBaseline = 'alphabetic'`.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment jsdom`; підмінний контекст як у `diploma.test.ts`, записує `fillText` з `font`/`fillStyle`, `fillRect`, `strokeRect`):
  - `renders 1080 by 1350 and draws every layout text` — `canvas.width/height` (spy на `document.createElement('canvas')`) = 1080/1350; усі `text` з `resultLayout(data, fakeMeasure, false)` намальовано в тому ж порядку.
  - `the look does not follow the app theme` — `document.documentElement.dataset.theme = 'dark'` і `'light'` → однакові послідовності `fillStyle`.
  - `no 2d context rejects` — `getContext` → `null` → `rejects.toThrow('canvas_unavailable')`.
  - `emoji use a visible colour` — `fillStyle` для `'🥇'` ≠ кольору тла.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image/render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/result-image/render.ts apps/web/src/result-image/render.test.ts
git commit -m "feat(web): 41 result image — the layout drawn on a 1080×1350 canvas into a PNG, the same festive look in any app theme"
```

---

### Задача 5. Веб: кнопка й прев'ю (`ResultImageButton`)

**Files:**
- Create: `apps/web/src/result-image/ResultImage.tsx`, `apps/web/src/result-image/ResultImage.test.tsx`
- Modify: `apps/web/src/styles.css` — `.result-image-button`, `.result-preview` (затемнене тло на весь екран, картинка `max-height: 70vh; width: auto; max-width: 100%`, кнопки в ряд із переносом, світла й темна тема через наявні змінні).

**Interfaces:**
- Consumes: `renderResultImage` (задача 4), `resultFileName` (задача 3), `sharePng`, `downloadPng`, `canShareFile` (задача 1).
- Produces:
```tsx
/** «📸 Підсумок картинкою»: малює картинку з build() і відкриває прев'ю; помилка — «Не вдалося створити картинку.». */
export function ResultImageButton({ build, className }: { build: () => ResultImageData; className?: string }): JSX.Element;
```

- [ ] **Step 1: Write the failing tests** (`renderResultImage` замокано через `vi.mock('./render')`, `URL.createObjectURL`/`revokeObjectURL` — заглушки):
  - `opens a preview with the image` — клік по `'📸 Підсумок картинкою'` → `getByRole('dialog', { name: 'Підсумок гри' })`, `img` з `alt` `'Картинка з підсумком гри'` і `src` від `createObjectURL`; кнопка `disabled`, поки малюється.
  - `share is offered only when files can be shared` — `canShare → true`: є «Поділитися», клік → `navigator.share` з файлом `pidsumok-<назва>.png`; без `canShare`: «Поділитися» немає, є «Завантажити».
  - `a cancelled share keeps the preview without an error` — `share` відхиляє `AbortError` → діалог відкритий, `queryByRole('alert')` — null.
  - `download saves the file` — «Завантажити» → `a[download="pidsumok-Зимова-вікторина.png"]` клікнуто.
  - `close, Escape and the backdrop close and revoke` — кожен шлях закриває діалог, `revokeObjectURL` викликано, фокус повертається на кнопку.
  - `a failed render shows a quiet error` — `renderResultImage` відхиляє → `role="alert"` з `'Не вдалося створити картинку.'`, діалогу немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image/ResultImage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** (діалог за зразком `CropDialog.tsx`: Escape і пастка Tab на документі).
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/result-image apps/web/src/i18n.test.ts apps/web/src/source-scan.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/result-image apps/web/src/styles.css
git commit -m "feat(web): 41 result image — a button and a preview with share (only when files can be shared), download and close, a cancelled share is no error"
```

---

### Задача 6. Веб: кнопка на телефоні, на пульті й в історії

**Files:**
- Modify: `apps/web/src/screens/PlayerScreen.tsx` — `useQuizTitle(code, phase === 'finished')` (одна назва й для диплома); після `{place}` — `{ceremony === null && view.standings !== null && view.standings.length > 0 && <ResultImageButton build={() => resultFromPlayer(view, quizTitle, new Date(), location.host)} />}`.
- Modify: `apps/web/src/screens/HostScreen.tsx` — `const quizTitle = useQuizTitle(code, phase === 'finished')`; у `section.panel` фіналу після `<Standings>` — кнопка з `resultFromHost(...)`, коли `view.standings.length > 0`.
- Modify: `apps/web/src/pages/GameHistory.tsx` — під `p.meta` заголовка: кнопка з `resultFromHistory(game, location.host)`, коли `game.status === 'finished' && game.standings.length > 0`.
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `apps/web/src/screens/HostScreen.test.tsx`, `apps/web/src/pages/History.test.tsx`, `apps/web/src/screens/StageScreen.test.tsx`.

**Interfaces:** Consumes: `ResultImageButton` (задача 5), `resultFromPlayer`/`resultFromHost`/`resultFromHistory` (задача 3).

- [ ] **Step 1: Write the failing tests:**
  - `PlayerScreen`: `finished` зі `standings` → кнопка `'📸 Підсумок картинкою'` є; під час церемонії (`prizes` з переможцями, церемонія ще йде) — немає; `question` — немає; клік (рендер замокано) передає в `renderResultImage` дані з `me` поза трійкою й своїми досягненнями.
  - `HostScreen`: `finished` → кнопка є в панелі фіналу; дані мають `me: null` і досягнення з `view.newAchievements.people`; лобі — немає.
  - `History.test.tsx`: завершена гра → кнопка є, клік передає `prizes`/`achievements` з `result`; `status: 'aborted'` чи порожні `standings` → кнопки немає.
  - `StageScreen`: `finished` — кнопки немає.
- [ ] **Step 2: Run** `pnpm test --project web --maxWorkers=2 apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/pages/History.test.tsx apps/web/src/screens/StageScreen.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test --project web --maxWorkers=2 && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/src/screens/PlayerScreen.tsx apps/web/src/screens/HostScreen.tsx apps/web/src/pages/GameHistory.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx apps/web/src/pages/History.test.tsx apps/web/src/screens/StageScreen.test.tsx
git commit -m "feat(web): 41 result image — the button on the finished phone after the ceremony, in the host final panel and on a finished game in the history, none on the stage"
```

---

### Задача 7. Наскрізні сценарії й кадри (`part41-result-image.e2e.ts`)

**Files:**
- Create: `apps/server/e2e/part41-result-image.e2e.ts`

Сценарії (`useE2eServer`; вікторина — 1 класичний раунд, 3 запитання про природу й українські річки, таймер 30 с; світла тема через `localStorage['quiz:theme'] = 'light'` в init-скрипті всіх сторінок; PNG перевіряти так: підпис `89 50 4E 47 0D 0A 1A 0A`, ширина `png.readUInt32BE(16) === 1080`, висота `png.readUInt32BE(20) === 1350`):

- `part 41: result image — a phone at 360 px and the host share a 1080×1350 summary, a preview opens, the history page draws the prizes and achievements`:
  1. Ведучий (`register(host, 'host', …)`) створює приз «Кубок» (`POST ${base}/api/me/prizes`, як у part 25) і ставить його на 1-ше місце в лобі. Гравці: Оля з акаунтом (`register`, телефон 360×740, `noShare`), Петро й Іра — гості (360 px). Оля відповідає правильно на все, Петро — на одне, Іра — ні на що.
  2. Після кінця й церемонії в Олі — кнопка «📸 Підсумок картинкою»; клік → діалог «Підсумок гри» з картинкою (`img.naturalWidth === 1080`, `naturalHeight === 1350`), «Поділитися» немає (`noShare`), «Завантажити» → `download.suggestedFilename()` = `pidsumok-<назва>.png`, PNG 1080×1350; `expectNoSideScroll` з відкритим діалогом; кадр `p41-phone-preview`.
  3. Петро й Іра (обидва в трійці) — кнопка є, прев'ю відкривається, PNG 1080×1350 (вміст «Я» перевіряють юніт-тести задачі 3, не e2e).
  4. Пульт (1280×800 і окремо 360 px): кнопка в панелі фіналу, прев'ю відкривається, «Завантажити» дає PNG 1080×1350; на 360 px — без бокового скролу; кадр `p41-host-preview`.
  5. Сторінка `/history/<id>` ведучого: кнопка є, прев'ю відкривається, PNG 1080×1350; у відповіді `GET /api/games/<id>` (`page.waitForResponse`) поле `result.prizes[0]` = `{ place: 1, trophy: { kind: 'cup', … }, winners: ['Оля'] }`, `result.achievements` містить Олю, у тілі немає email Олі; кадр `p41-history-preview`.
  6. Escape закриває прев'ю, фокус на кнопці; сцена (1280×720) на фініші кнопки не має.
  7. Чорнила: як у part 14a ~788 — картинку в `<img>` на сторінці 1080×1350, темних пікселів > 5000 (текст є), світле тло (середня яскравість > 200).

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `pnpm build`, потім (після завершення збирання) `npx vitest run --config apps/server/e2e/vitest.config.ts -t "part 41"` з `E2E_SHOTS=1` — на передньому плані. Expected: PASS; кадри в `apps/server/e2e/artifacts`.
- [ ] **Step 3: Переглянути кадри:** назва й п'єдестал читаються, нічого не обрізано не з того боку, низ не перекрито, прев'ю на 360 px уміщається з кнопками.
- [ ] **Step 4: Commit**
```bash
git add apps/server/e2e/part41-result-image.e2e.ts
git commit -m "test(e2e): part 41 — a result image from a 360 px phone, the host and the history page: a preview, download without Web Share, a 1080×1350 PNG with text on a light background, prizes and achievements in the history, none on the stage, light theme"
```
