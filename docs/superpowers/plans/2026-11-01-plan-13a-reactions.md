# План 13a: реакції та стікери під час гри (беклог #7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** уся специфікація `docs/superpowers/specs/2026-11-01-reactions-stickers-design.md`. Між запитаннями, на підсумку раунду й на фіналі будь-хто в грі (гравець або ведучий) надсилає швидке емодзі чи стікер-котика. Реакція з'являється біля його ніка в таблиці на сцені й на телефонах, а якщо його рядка на екрані немає, то в запасній смузі. Кнопка «😀 Реакція» відкриває нижній аркуш із трьома частинами: швидкі емодзі, «★ Мої улюблені» і «Усі стікери».

**Архітектура:**
- **Набір стікерів.** Файли лежать лише в R2 під префіксом `stickers/`. Разовий скрипт `apps/server/scripts/upload-stickers.ts <тека>` викидає дублікати, нормалізує id, пише маніфест `packages/shared/src/sticker-list.ts` (комітиться) і завантажує файли. Маніфест містить тільки `id`, `ext` і `series`.
- **Як веб отримує файли.** Публічної бази R2 у проєкті **немає**: бакет приватний (S3 API, `r2.ts`), а завантажені зображення сервер віддає сам за `/uploads/:name`. Стікери йдуть тим самим шляхом: новий маршрут `GET /stickers/:file` читає `stickers/<id>.<ext>` зі сховища (R2 у проді, тека на диску локально, пам'ять у тестах). Веб бере відносний URL `/stickers/<id>.<ext>` без жодної конфігурації. Локально та в e2e, коли файла немає, маршрут віддає фікстуру `apps/server/fixtures/stickers/sample.<ext>` (опція `stickerFixtures`).
- **Протокол.** `player:react` / `host:react` з `ReactionItem` → `manager.react` перевіряє фазу й ліміт «1 раз на 2 с» → подія кімнати `reaction` → `socket.emit('reaction', Reaction)` усім учасникам кімнати. Стан гри не змінюється, `apply` не викликається, у базу нічого не пишеться.
- **Веб.** `useGame` тримає останню реакцію кожної людини 4 с. `ReactionsProvider` роздає їх рядкам: `RowReaction` у `Standings`, `ScoreTable`, `SurvivalBoard` і `WipeoutPlayers` реєструє «мій рядок на екрані», а `ReactionStrip` показує решту. Кнопка й аркуш — `ReactionButton` / `ReactionSheet`. Улюблені — `useFavoriteStickers`: для акаунта через `/api/me/stickers`, для гостя в localStorage.
- **Улюблені в профілі:** міграція `0019_favorite_stickers` (`profile.favorite_stickers text[] not null default '{}'`).

**Стан гри не змінюється: `GAME_STATE_VERSION` лишається 21.** Реакції ефемерні. Лічильник і вікно частоти живуть у пам'яті кімнати (як `awardsSeq`), у збережену кімнату й історію не потрапляють. Деплой живих ігор не обриває.

**Технології:** TypeScript, zod, vitest, Fastify + Socket.IO, Drizzle + drizzle-kit + PGlite, React 19 + Vite, Testing Library (jsdom), Playwright. Нових залежностей немає.

**Spec:** `docs/superpowers/specs/2026-11-01-reactions-stickers-design.md`

## Рішення (там, де специфікація лишила місце будівникові)

- **Дедуплікація (на теці власника `D:\myfiles\gifs`, 446 файлів):**
  1. Розширення (без регістру) — лише `gif` / `png`, інакше `not_image`.
  2. `core` = назва без розширення, з якої знято хвіст `~\d+` або `-\d{6,}`.
  3. `core` має відповідати `/^[A-Za-z][A-Za-z0-9]{0,39}$/`, інакше `bad_name`. Це захист від сторонніх файлів.
  4. Вміст має збігатися з розширенням (`GIF87a` / `GIF89a`, підпис PNG), інакше `content_mismatch`.
  5. Файл із хвостом, коли є файл з `core` без хвоста (будь-якого розширення), — `duplicate`. Так відпадають `nyaChips~1.gif`, `nyaGlasses~1.png`, `nyaaFlowers-679…png`, `nyasBite1-586…gif`, `nyasSleep-661…png`.
  6. Файл із хвостом без такої пари **лишається** під `core`: `nyaBoba~1.gif` → `nyaBoba`.
  7. Кілька файлів з одним `core` без різниці регістру: перевага `gif` над `png` (анімація). Решта — `duplicate`: `nyaNana.png`, `nyaaSuika.png`, `nyasComfort.png`, `nyasHappy.png`.
  - **Очікуваний підсумок: 437 стікерів** (nya 208, nyaa 116, nyas 108, other 5), пропущено 9.
- **Id = `core` як є** (camelCase, напр. `nyaBeach`), без зміни регістру. Серія: `/^(nyaa|nyas|nya)(?=[A-Z0-9])/`, інакше `other` (`Burn`, `bit`, `eat`, `heart`, `yay`).
- **Порядок:** серії `nya`, `nyaa`, `nyas`, `other`; усередині — `localeCompare(…, 'en', { sensitivity: 'base', numeric: true })`, тож `nyaCute2` < `nyaCute10`.
- **Протокол:** `player:react` (гравець, зокрема автор у грі без ведучого) і `host:react` (лише роль `host`). Обидва несуть `ReactionItem`. Широкомовна подія `reaction` іде всім ролям кімнати: сцені, пульту, телефонам, зокрема самому автору.
- **Ведучий:** `by: 'host'`, `nickname: null`, `rowId: null`, і його реакція завжди йде в запасну смугу з підписом «Ведучий». Окремої «позначки ведучого» на сцені немає, тож смуга і є цим місцем.
- **Ліміт:** сервер приймає від однієї людини (`by`) не частіше ніж раз на `REACTION_GAP_MS = 2000`. Відхилена спроба вікна не подовжує. Відповідь — `too_soon` (код уже є). Клієнт після успіху чи `too_soon` вимикає кнопки на 2000 мс.
- **Фаза:** `REACTION_PHASES = ['reveal', 'leaderboard', 'round_end', 'finished']`. Пауза не заважає. Сервер не перевіряє «поле відповіді на телефоні»: кнопку для `survival.canAnswerTrial` / `canPickDoor` ховає клієнт.
- **Улюблені:** понад 40 — нове додається на початок, а найстаріше (останнє) випадає, без помилки. Невідомі id (стікер зник із маніфесту) мовчки відкидаються під час читання й запису.
- **Дошки з ніками:** бейдж стоїть у `Standings`, `ScoreTable`, `SurvivalBoard` і `WipeoutPlayers`. `LadderBoard` («Мільйонер»: сходинки, а не ніки), «Відповідей наживо», поле, лобі тощо — це смуга.
- **Командна гра:** `rowId` = команда автора (`teamOf`), тож бейдж стоїть у рядку команди з ніком автора поруч. Якщо `rowId === by`, нік не пишеться.
- **Смуга:** `position: fixed` внизу екрана з постійною висотою `--reaction-strip-h` (телефон і пульт `3rem`, сцена `5rem`). У дозволених фазах `main` має клас `has-reactions` з таким самим запасом унизу (як `has-appeal`), тож смуга нічого не перекриває. Картка апеляції на сцені з `has-reactions` піднімається на висоту смуги.
- **PWA-precache:** сервіс-воркера в проєкті немає, тож стікери туди потрапити не можуть. Вони вантажаться лише відкритою панеллю (`loading="lazy"`, сітка змонтована тільки з відкритим аркушем).
- **Кешування:** справжній стікер — `cache-control: public, max-age=31536000, immutable` (id стабільні). Фікстура — `no-store`.

## Глобальні обмеження

- **Анти-ціль:** реакції не перекривають таблицю, запитання чи кнопки й не зсувають полів відповіді. Під час `question` / `locked` кнопки й смуги немає.
- **Анти-ціль:** ніхто не засипає екран: 1 реакція / 2 с від людини (сервер), одна видима реакція на людину (нова замінює стару), 4 с показу.
- **Анти-ціль:** панель не вантажить 12 МБ одразу: картинки `loading="lazy"`, `width`/`height` задано, сітка лише у відкритому аркуші.
- **Анти-ціль:** гра не чекає реакцій. `manager.react` не викликає `apply`, не пише в базу, не шле `changed`.
- `GAME_STATE_VERSION` 21 без змін; `restore.test.ts` без змін.
- Файлів стікерів у git немає. Комітяться лише маніфест і дві крихітні фікстури (`sample.gif`, `sample.png`), створені нами.
- Жодного контенту про росію (правило власника): тексти й e2e-вікторина — про Україну (Дніпро, Чернівці).
- Тексти інтерфейсу — лише в `apps/web/src/i18n.ts`, тон «ти», коротко.
- Меню на ігрові екрани не додаємо.
- Звуку немає. З `prefers-reduced-motion: reduce` бейдж з'являється без анімації `reaction-pop`, а GIF лишаються анімованими.
- Телефон 375 px без горизонтальної прокрутки; сцена 1280 × 720 без прокрутки.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом мають бути зелені `pnpm typecheck` і тести:
  - `pnpm vitest run --maxWorkers=2 packages`;
  - `pnpm vitest run --maxWorkers=2 apps/server`;
  - `pnpm vitest run --maxWorkers=2 apps/web`.
- e2e: спершу `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 13a"`, **лише на передньому плані**. Кадри — `apps/server/e2e/artifacts/shots/p13a-*`.
- Кожен коміт закінчується рядками:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1
  ```
- Після останньої задачі й фінальної рецензії: завантажити стікери в R2 (задача 7, крок 4), злити в `main` і запушити (правило «Push after work»). Якщо власник саме грає, діє «Push hold while playing».

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/stickers.ts` (новий), `sticker-list.ts` (згенерований), `stickers.test.ts` (новий), `index.ts`; `apps/server/scripts/sticker-plan.ts` (новий), `sticker-plan.test.ts` (новий), `upload-stickers.ts` (новий) | маніфест, правила імпорту, скрипт | 1 |
| `packages/shared/src/reactions.ts` (новий), `reactions.test.ts` (новий), `events.ts`, `index.ts`; `apps/server/src/rooms/manager.ts`, `manager.reactions.test.ts` (новий), `socket.ts`, `socket.test.ts` | протокол, ліміт, ретрансляція | 2 |
| `apps/server/src/storage/images.ts`, `images.test.ts`, `storage/r2.ts`, `sticker-routes.ts` (новий), `sticker-routes.test.ts` (новий), `app.ts`, `main.ts`, `fixtures/stickers/sample.{gif,png}` (нові); `apps/web/vite.config.ts` | роздача `/stickers/:file` | 3 |
| `apps/server/drizzle/0019_favorite_stickers.sql` + `meta`, `src/db/schema.ts`, `profiles.ts`, `profile-routes.ts`, `profile-routes.test.ts` | улюблені в профілі | 4 |
| `apps/web/src/reactions.ts` (новий), `reactions.test.ts` (новий), `live/Reactions.tsx` (новий), `live/Reactions.test.tsx` (новий), `live/useGame.ts`, `useGame.test.tsx`, `screens/Standings.tsx`, `ScoreTable.tsx`, `SurvivalBoard.tsx`, `WipeoutLadder.tsx`, `StageScreen.tsx`, `PlayerScreen.tsx`, `HostScreen.tsx` (+ тести), `pages/{Play,Stage,Host}.tsx`, `i18n.ts`, `styles.css` | показ: бейджі й смуга | 5 |
| `apps/web/src/screens/ReactionSheet.tsx` (новий), `ReactionSheet.test.tsx` (новий), `live/useFavoriteStickers.ts` (новий), `useFavoriteStickers.test.tsx` (новий), `api.ts`, `PlayerScreen.tsx`, `HostScreen.tsx` (+ тести), `i18n.ts`, `styles.css` | кнопка, аркуш, улюблені, пауза | 6 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 13a, `stickerFixtures: true` | 7 |

## Порядок збирання

- 1 → 2 → 3 → 4 (сервер і shared по черзі: `index.ts`, `app.ts`), далі 5 → 6 (веб: спільні `PlayerScreen.tsx`, `i18n.ts`, `styles.css`), і 7 останньою.
- **Навмисні зміни наявних очікувань:** немає. Нові пропси (`reactions`) необов'язкові з типовим `[]`, а `RowReaction` поза провайдером нічого не малює. Якщо падає старий тест, рецензент розбирає причину, а не правку очікування.

## На що дивитися рецензентові (Review Focus)

1. **Реакція, що прийшла на межі фаз.** Телефон уже в `question`, а реакція ще жива (4 с). Вона не малюється, кнопки немає, смуга зникає. Тест — задача 5 (`PlayerScreen` у `question` з непорожніми `reactions`).
2. **Сміттєві дані.** `player:react` з id `../x`, `nyaBeach.gif`, рядком у 10 000 символів, невідомим емодзі чи без `kind` дає `invalid_payload`. `/stickers/..%2Fsecret`, `/stickers/nyaBeach.png` (коли в маніфесті gif) і `/stickers/Unknown.gif` дають 404, і сховище при цьому не питають. Тести — задачі 2, 3.
3. **Шквал.** 10 спроб однієї людини за 2 с дають одну подію `reaction`, інші люди (і ведучий) мають окремі вікна, а після 2000 мс знову `ok`. Тест — задача 2 (`FakeScheduler`).
4. **Перезапуск / піднята з бази кімната.** Кімната, відновлена `restore`, має `reactRate` і `reactionSeq`, і `react` повертає `ok`. Тест — задача 2.
5. **Командна гра й «невидимий» автор.** Реакція людини команди стоїть у рядку команди з її ніком. Автор, чий рядок обрізано «…і ще N», чи вибитий потрапляє в смугу, а не зникає. Тести — задача 5.

---

### Задача 1. Набір стікерів: правила імпорту, маніфест у shared, скрипт завантаження

**Files:**
- Create: `packages/shared/src/stickers.ts`, `packages/shared/src/stickers.test.ts`, `packages/shared/src/sticker-list.ts` (генерує скрипт), `apps/server/scripts/sticker-plan.ts`, `apps/server/scripts/sticker-plan.test.ts`, `apps/server/scripts/upload-stickers.ts`
- Modify: `packages/shared/src/index.ts` (`export * from './stickers'`)

**Interfaces:**
- Produces (`packages/shared/src/stickers.ts`):
  ```ts
  export type StickerSeries = 'nya' | 'nyaa' | 'nyas' | 'other';
  export const STICKER_SERIES: readonly StickerSeries[]; // ['nya', 'nyaa', 'nyas', 'other']
  export interface Sticker { id: string; ext: 'gif' | 'png'; series: StickerSeries }
  export const STICKER_ID: RegExp; // /^[A-Za-z][A-Za-z0-9]{0,39}$/
  export const STICKERS: readonly Sticker[]; // = STICKER_LIST з sticker-list.ts
  export function stickerOf(id: string): Sticker | undefined; // через Map, без перебору
  export function stickerPath(sticker: Sticker): string; // `/stickers/${id}.${ext}`
  export function seriesOf(id: string): StickerSeries;
  export function compareStickers(a: Sticker, b: Sticker): number; // серія за STICKER_SERIES, далі localeCompare('en', { sensitivity: 'base', numeric: true })
  ```
- `sticker-list.ts` — згенерований файл. Перший рядок `// Згенеровано apps/server/scripts/upload-stickers.ts — не правити вручну.`, далі `import type { Sticker } from './stickers';` і `export const STICKER_LIST: readonly Sticker[] = [` з одним `{ id: '…', ext: '…', series: '…' },` на рядок.
- Produces (`apps/server/scripts/sticker-plan.ts`):
  ```ts
  export interface SourceFile { name: string; bytes: Uint8Array }
  export type SkipReason = 'not_image' | 'bad_name' | 'content_mismatch' | 'duplicate';
  export interface StickerPlan { stickers: (Sticker & { source: string })[]; skipped: { name: string; reason: SkipReason }[] }
  /** Правила 1–7 з «Рішень»; stickers відсортовано compareStickers. */
  export function planStickers(files: SourceFile[]): StickerPlan;
  export function renderStickerList(stickers: Sticker[]): string;
  ```
- CLI: `pnpm --filter @quiz/server exec tsx --env-file-if-exists=../../.env scripts/upload-stickers.ts <тека> [--manifest-only]`.
  1. Читає теку (без вкладених) і викликає `planStickers`.
  2. Друкує `437 стікерів (nya 208, nyaa 116, nyas 108, інші 5); пропущено 9:` і далі список `назва — причина`.
  3. Пише `packages/shared/src/sticker-list.ts`.
  4. Без `--manifest-only` потрібні всі чотири `R2_*` (як у `main.ts`), інакше вихід з кодом 1 і повідомленням `Задайте R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.` Далі `r2Storage(...).put('stickers/<id>.<ext>', bytes, 'image/gif' | 'image/png')` по 4 паралельно і рядок `Завантажено 437 файлів.` (`put` для ключів `stickers/…` з'являється в задачі 3, тож завантаження без `--manifest-only` запускається лише після неї.)

- [ ] **Step 1: Write the failing tests**
  - `sticker-plan.test.ts` (байти — `GIF = 'GIF89a…'`, `PNG = підпис PNG + 4 байти`):
    - `nyaChips.png` + `nyaChips~1.gif` → лишається `{ id: 'nyaChips', ext: 'png' }`, а `nyaChips~1.gif` — `duplicate`;
    - `nyaBoba~1.gif` без `nyaBoba.*` → `{ id: 'nyaBoba', ext: 'gif', source: 'nyaBoba~1.gif' }`;
    - `nyasSleep.png` + `nyasSleep-661665921831665684.png` → другий `duplicate`;
    - `nyaNana.gif` + `nyaNana.png` → лишається gif, png — `duplicate`;
    - `notes.txt` → `not_image`; `кіт.png` і `nya Cat.png` → `bad_name`; `fake.gif` з байтами PNG → `content_mismatch`; `UPPER.GIF` → `{ id: 'UPPER', ext: 'gif' }`;
    - порядок: `['yay.gif', 'nyasHug1.gif', 'nyaaBox.gif', 'nyaCute10.gif', 'nyaCute2.gif']` → `['nyaCute2', 'nyaCute10', 'nyaaBox', 'nyasHug1', 'yay']`;
    - `renderStickerList` починається з рядка-попередження, а результат, виконаний як TS-модуль (або перевірений регулярним виразом рядків), відтворює вхід.
  - `stickers.test.ts`:
    - `STICKERS.length === 437`; кількість за серіями `{ nya: 208, nyaa: 116, nyas: 108, other: 5 }`;
    - id унікальні без різниці регістру й відповідають `STICKER_ID`; кожен `series === seriesOf(id)`;
    - масив уже відсортовано `compareStickers`; `stickerOf('nyaBoba')?.ext === 'gif'`; `stickerOf('nyaNana')?.ext === 'gif'`; `stickerOf('nyaChips')?.ext === 'png'`; `stickerOf('nope') === undefined`;
    - `stickerPath(stickerOf('yay')!) === '/stickers/yay.gif'`;
    - жоден id не містить `rus`, `ussr`, `sovi`, `mosc`, `krem`, `putin` (регістр не важить).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/stickers.test.ts apps/server/scripts/sticker-plan.test.ts` → FAIL.
- [ ] **Step 3: Implement** `stickers.ts`, `sticker-plan.ts`, `upload-stickers.ts`. Згенерувати маніфест без завантаження: `pnpm --filter @quiz/server exec tsx scripts/upload-stickers.ts "D:\myfiles\gifs" --manifest-only`. Скопіювати в репозиторій **лише** `sticker-list.ts`, без жодного файлу з теки.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages apps/server/scripts` → PASS. Вивід скрипта — `437 стікерів (nya 208, nyaa 116, nyas 108, інші 5); пропущено 9`.
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/server/scripts
  git commit -m "feat: the sticker set — a one-off script reads the owner's folder, drops «~1» and long-number duplicates and static twins of GIFs, keeps 437 cats as stable ids in series nya, nyaa, nyas and others, and commits only the manifest (the files go to R2)

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 2. Протокол і сервер: `player:react` / `host:react`, фаза, ліміт, ретрансляція

**Files:**
- Create: `packages/shared/src/reactions.ts`, `packages/shared/src/reactions.test.ts`, `apps/server/src/rooms/manager.reactions.test.ts`
- Modify: `packages/shared/src/events.ts`, `packages/shared/src/index.ts`, `apps/server/src/rooms/manager.ts`, `apps/server/src/socket.ts`, `apps/server/src/socket.test.ts`

**Interfaces:**
- Consumes: `stickerOf` (задача 1); `Phase` з `game.ts`; `teamOf`, `memberOf` з `@quiz/engine`.
- Produces (`packages/shared/src/reactions.ts`):
  ```ts
  export const QUICK_EMOJI = ['👏', '😂', '😱', '🔥', '😭', '🤯'] as const;
  export type QuickEmoji = (typeof QUICK_EMOJI)[number];
  export const REACTION_PHASES: readonly Phase[]; // ['reveal', 'leaderboard', 'round_end', 'finished']
  export const reactionAllowed: (phase: Phase) => boolean;
  export const REACTION_GAP_MS = 2000;
  export const REACTION_SHOW_MS = 4000;
  export const FAVORITE_STICKERS_MAX = 40;
  export type ReactionItem = { kind: 'emoji'; value: QuickEmoji } | { kind: 'sticker'; value: string };
  /** discriminatedUnion за kind; sticker.value — z.string().max(40), що є в маніфесті (stickerOf). */
  export const reactSchema: z.ZodType<ReactionItem>;
  export interface Reaction {
    seq: number;
    /** id гравця чи людини команди; 'host' — ведучий. */
    by: string;
    /** null — ведучий (веб пише «Ведучий»). */
    nickname: string | null;
    /** participantId рядка таблиці: команда автора в командній грі, інакше by; null — ведучий. */
    rowId: string | null;
    item: ReactionItem;
  }
  export const favoriteStickersSchema: z.ZodType<{ favorites: string[] }>; // z.array(z.string().max(40)).max(40)
  /** Лише відомі id, без повторів (перший лишається), не більше 40. */
  export function normalizeFavorites(ids: readonly string[]): string[];
  /** Є — прибрати; немає — на початок, понад 40 найстаріший (останній) випадає. */
  export function toggleFavorite(list: readonly string[], id: string): string[];
  ```
- `events.ts`:
  - `ClientToServerEvents`: `'player:react': (payload: ReactionItem, ack: Ack) => void`, `'host:react': (payload: ReactionItem, ack: Ack) => void`;
  - `ServerToClientEvents`: `/** Реакція (13a): усім ролям кімнати; стан гри той самий. */ reaction: (reaction: Reaction) => void`.
- `manager.ts`:
  - `RoomEvent` отримує `| { type: 'reaction'; reaction: Reaction }`;
  - `Room` отримує `reactRate: Map<string, number>` (людина → мить останньої прийнятої реакції) і `reactionSeq: number`. Обидва лише в пам'яті й ініціалізуються в **обох** місцях створення кімнати (там, де `awardsSeq: Date.now()`): `reactRate: new Map()`, `reactionSeq: Date.now()`;
  - метод:
    ```ts
    /** Реакція (13a): лише REACTION_PHASES; не частіше REACTION_GAP_MS від людини; стан гри не змінюється. */
    react(room: Room, by: string, item: ReactionItem): AckResult
    ```
    Порядок перевірок: `alive`, далі фаза (`wrong_phase`), далі людина (`by !== 'host'`, яку не знайдено ні серед `memberOf`, ні серед гравців, — `not_found`), далі ліміт (`too_soon`). Нік: `memberOf(state, by)?.nickname ?? гравець.nickname`. `rowId = teamOf(state, by) ?? by`. Потім `emit(room, { type: 'reaction', reaction })`.
- `socket.ts`:
  - `on('player:react')`: роль `player` з `playerId`, інакше `FORBIDDEN`; `reactSchema` → `manager.react(room, playerId, item)`, інакше `INVALID`;
  - `on('host:react')`: лише `isHost` (не `hostSide`: автор у грі без ведучого шле `player:react`), інакше `FORBIDDEN` → `manager.react(room, 'host', item)`;
  - у `manager.onEvent`: `if (event.type === 'reaction') { members.forEach((s) => s.emit('reaction', event.reaction)); return; }`.

- [ ] **Step 1: Write the failing tests**
  - `reactions.test.ts`:
    - `reactSchema` приймає `{ kind: 'emoji', value: '🔥' }` і `{ kind: 'sticker', value: STICKERS[0].id }`; відхиляє `{ kind: 'emoji', value: '💩' }`, `{ kind: 'sticker', value: '../x' }`, `{ kind: 'sticker', value: `${STICKERS[0].id}.gif` }`, `'x'.repeat(10_000)`, `{ value: '🔥' }`;
    - `reactionAllowed`: true для чотирьох фаз, false для `lobby`, `question`, `locked`, `intro`, `board`, `wager`, `duel`, `guide`;
    - `normalizeFavorites([b, a, 'nope', b])` → `[b, a]`; 45 відомих → перші 40;
    - `toggleFavorite([a, b], c)` → `[c, a, b]`; `toggleFavorite([a, b, c], b)` → `[a, c]`; на 40 → 40 з новим першим і без колишнього останнього.
  - `manager.reactions.test.ts` (за зразком `manager.awards.test.ts`: `FakeScheduler`, `game([...])`):
    - у `reveal` реакція Олі дає `{ ok: true }` і одну подію `{ type: 'reaction', reaction: { by: olya, nickname: 'Оля', rowId: olya, item } }`, а `room.state` — той самий об'єкт, і `JSON.stringify` не змінився; події `changed` немає;
    - `question` → `wrong_phase`, як і `lobby`; `leaderboard`, `round_end` і `finished` → `ok`;
    - ліміт: 10 спроб Олі одна за одною дають 1 `ok` і 9 `too_soon`. `scheduler.advance(1999)` → `too_soon`; ще `advance(1)` → `ok`. Петро й `'host'` у ту саму мить → `ok`. `seq` зростає;
    - ведучий: `react(room, 'host', …)` → `nickname: null`, `rowId: null`;
    - невідомий `by` → `not_found`;
    - командна гра (помічник `testing/team-game`): людина команди → `rowId` = id команди, `nickname` = нік людини;
    - кімната, піднята через `restore` (за зразком `manager.restore.test.ts`), у `reveal` → `react` повертає `ok`.
  - `socket.test.ts`, `describe('reactions over sockets (13a)')`:
    - довести гру до `reveal` (`host:lock`, `until(stage, inPhase('reveal'))`); Олена шле `player:react` зі стікером, і `host`, `stage`, `olena` і `taras` отримують однаковий `Reaction` (`by` = id Олени, `nickname: 'Олена'`);
    - `stage` → `player:react` і `host:react` дають `forbidden`; `olena` → `host:react` дає `forbidden`; `host` → `host:react` 👏 дає `ok`, `nickname: null`;
    - `{ kind: 'sticker', value: 'nope' }` → `invalid_payload`; без даних → `invalid_payload`;
    - у `question` → `wrong_phase`; одразу друга від Олени → `too_soon`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared/src/reactions.test.ts apps/server/src/rooms/manager.reactions.test.ts apps/server/src/socket.test.ts` → FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages apps/server` → PASS (зокрема `restore.test.ts` без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add packages/shared/src apps/server/src
  git commit -m "feat(server): in-game reactions — player:react and host:react carry a quick emoji or a sticker id from the manifest, are accepted only on the reveal, between questions, on the round summary and the finish, at most once in 2 s per person, and reach every screen of the room as «reaction» without touching the game state

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 3. Сервер: роздача `/stickers/:file` зі сховища й фікстури

**Files:**
- Create: `apps/server/src/sticker-routes.ts`, `apps/server/src/sticker-routes.test.ts`, `apps/server/fixtures/stickers/sample.gif`, `apps/server/fixtures/stickers/sample.png`
- Modify: `apps/server/src/storage/images.ts`, `apps/server/src/storage/images.test.ts`, `apps/server/src/storage/r2.ts`, `apps/server/src/app.ts`, `apps/server/src/main.ts`, `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: `stickerOf`, `STICKERS` (задача 1).
- `images.ts`:
  ```ts
  export type StickerType = 'image/gif' | 'image/png';
  /** Ключ стікера у сховищі: stickers/<id>.<gif|png>. */
  export const isStickerKey: (name: string) => boolean; // /^stickers\/[A-Za-z][A-Za-z0-9]{0,39}\.(gif|png)$/
  export function sniffSticker(bytes: Uint8Array): StickerType | null; // GIF87a / GIF89a, підпис PNG
  ```
  - `ImageStorage.put(name, bytes, contentType: MediaType | StickerType)`;
  - `memoryStorage`, `diskStorage` (з `mkdir(dirname(...), { recursive: true })`) і `r2Storage` приймають у `put` / `get` назву, для якої `isMediaName(name) || isStickerKey(name)`;
  - `sniffImage` **не змінюється**: GIF через `/api/uploads` і далі не приймаються.
- `sticker-routes.ts`:
  ```ts
  export interface StickerDeps { storage: ImageStorage; fixtures: boolean }
  export async function registerStickerRoutes(app: FastifyInstance, deps: StickerDeps): Promise<void>
  ```
  `GET /stickers/:file`:
  1. `file` має бути `${id}.${ext}`, де `stickerOf(id)?.ext === ext`, інакше 404 `{ error: 'not_found' }`, і сховище не питають.
  2. Далі `storage.get('stickers/' + file)`; збій — 503 `{ error: 'storage_unavailable' }`.
  3. Знайдено, і `sniffSticker` збігся з `ext` → 200 з `content-type`, `x-content-type-options: nosniff`, `cache-control: public, max-age=31536000, immutable`. Кеш у пам'яті — `Map<string, Buffer>`: він обмежений маніфестом, ≈12 МБ.
  4. Не знайдено: з `fixtures` — байти `fixtures/stickers/sample.<ext>` з `cache-control: no-store`, інакше 404.
- `app.ts`: `AppOptions.stickerFixtures?: boolean` (типово `false`) і `await registerStickerRoutes(app, { storage: options.storage ?? <те саме сховище, що для uploads>, fixtures: options.stickerFixtures ?? false })`. Uploads і стікери ділять **один** екземпляр `memoryStorage()`, коли `storage` не передано.
- `main.ts`: `stickerFixtures: true`, коли R2 не налаштовано (сховище на диску).
- `vite.config.ts`: проксі `'/stickers': 'http://localhost:3000'`.
- Фікстури: `sample.png` — непрозорий PNG 48 × 48 (помаранчеве коло на білому, так само як `avatarPng()` в e2e); `sample.gif` — 1 × 1 GIF89a з base64 `R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=`. Обидва створити одноразовою командою node; генератор не комітиться.

- [ ] **Step 1: Write the failing tests**
  - `images.test.ts`:
    - `isStickerKey('stickers/nyaBeach.png')` → true; `'stickers/../x.png'`, `'stickers/a.webp'`, `'nyaBeach.png'` → false;
    - `sniffSticker` упізнає GIF89a, GIF87a і PNG, а JPEG дає `null`;
    - `memoryStorage` і `diskStorage` (тимчасова тека) зберігають і повертають `stickers/x.gif`; `sniffImage` для GIF і далі `null`.
  - `sticker-routes.test.ts` (за зразком `uploads.test.ts`: `buildApp({ db, auth: TEST_AUTH, storage })` з лічильником `reads`):
    - `put('stickers/<gif-id>.gif', GIF)` → `GET /stickers/<gif-id>.gif` дає 200, `image/gif`, `immutable`, ті самі байти; повторний GET сховище не питає (`reads` не росте);
    - `/stickers/<gif-id>.png`, `/stickers/Unknown.gif`, `/stickers/..%2Fsecret.gif` і `/stickers/<gif-id>` → 404, `reads` не змінився;
    - відомий id без файла: 404 без `stickerFixtures`; з `stickerFixtures: true` — 200, `no-store`, байти `sample.gif`;
    - сховище кидає виняток → 503.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/storage apps/server/src/sticker-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (`uploads.test.ts` без змін).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server apps/web/vite.config.ts
  git commit -m "feat(server): stickers are served at /stickers/<id>.<ext> from the same storage as uploaded images (R2 in production) only for ids in the manifest, cached for a year, and a local or test server without the files answers with a small sample picture

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 4. Улюблені стікери в профілі: міграція `0019` і `/api/me/stickers`

**Files:**
- Create: `apps/server/drizzle/0019_favorite_stickers.sql` + `meta/0019_snapshot.json`, `_journal.json` (згенерувати: з `apps/server` виконати `pnpm exec drizzle-kit generate --name favorite_stickers`)
- Modify: `apps/server/src/db/schema.ts`, `apps/server/src/profiles.ts`, `apps/server/src/profile-routes.ts`, `apps/server/src/profile-routes.test.ts`

**Interfaces:**
- Consumes: `favoriteStickersSchema`, `normalizeFavorites` (задача 2).
- SQL: коментар `-- Улюблені стікери (беклог 7): id з маніфесту, від нещодавно доданих.` і `ALTER TABLE "profile" ADD COLUMN "favorite_stickers" text[] DEFAULT '{}' NOT NULL;`.
- `schema.ts`: у `profile` — `favoriteStickers: text('favorite_stickers').array().notNull().default(sql\`'{}'\`)` з коментарем.
- `profiles.ts`:
  ```ts
  /** Улюблені користувача: лише відомі маніфесту id (normalizeFavorites); профілю ще немає — його створює ensureProfile. */
  export async function favoriteStickers(db: Db, userId: string): Promise<string[]>
  /** Записує normalizeFavorites(ids) і повертає записане. */
  export async function saveFavoriteStickers(db: Db, userId: string, ids: string[]): Promise<string[]>
  ```
- `profile-routes.ts`:
  - `GET /api/me/stickers` → `{ favorites: string[] }`; без сесії — 401;
  - `PUT /api/me/stickers` з тілом `favoriteStickersSchema` → `{ favorites }`; погане тіло — 400 `{ error: 'invalid_payload' }`; без сесії — 401.

- [ ] **Step 1: Write the failing tests** — `profile-routes.test.ts`, `describe('favorite stickers (13a)')`, з `a = STICKERS[0].id`, `b = STICKERS[1].id`:
  - без cookie обидва маршрути → 401;
  - новий акаунт: GET → `{ favorites: [] }`;
  - PUT `[b, a, 'nope', b]` → `{ favorites: [b, a] }`, і GET повертає те саме;
  - PUT 41 рядок → 400 `invalid_payload`; PUT `{ favorites: 'x' }` → 400;
  - рядок бази з `favorite_stickers = ['gone', a]` (вписаний напряму через `db.update(profile)`) → GET дає `[a]`;
  - профіль Тараса не змінився (улюблені — свої в кожного).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/server/src/profile-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement**: згенерувати міграцію, дописати коментар у SQL, реалізувати функції й маршрути.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/server` → PASS (зокрема `db/schema.test.ts`, якщо він порівнює міграції).
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server
  git commit -m "feat(server): a signed-in player keeps up to 40 favourite stickers in the profile (migration 0019, newest first, unknown ids dropped) through GET and PUT /api/me/stickers

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 5. Веб: живі реакції, бейджі біля ніків і запасна смуга

**Files:**
- Create: `apps/web/src/reactions.ts`, `apps/web/src/reactions.test.ts`, `apps/web/src/live/Reactions.tsx`, `apps/web/src/live/Reactions.test.tsx`
- Modify: `apps/web/src/live/useGame.ts`, `useGame.test.tsx`, `screens/Standings.tsx`, `screens/ScoreTable.tsx`, `screens/SurvivalBoard.tsx`, `screens/WipeoutLadder.tsx` (`WipeoutPlayers`), `screens/StageScreen.tsx`, `screens/PlayerScreen.tsx`, `screens/HostScreen.tsx`, `StageScreen.test.tsx`, `PlayerScreen.test.tsx`, `pages/Play.tsx`, `pages/Stage.tsx`, `pages/Host.tsx`, `i18n.ts`, `styles.css`

**Interfaces:**
- Consumes: `Reaction`, `ReactionItem`, `reactionAllowed`, `REACTION_SHOW_MS` (задача 2), `stickerOf`, `stickerPath` (задача 1).
- `reactions.ts`:
  ```ts
  /** Остання реакція кожної людини: та сама by замінює попередню й іде в кінець. */
  export function upsertReaction(list: readonly Reaction[], next: Reaction): Reaction[]
  export function dropReaction(list: readonly Reaction[], seq: number): Reaction[]
  /** Кнопка на телефоні: фаза з REACTION_PHASES і на телефоні немає поля випробування (survival canAnswerTrial / canPickDoor). */
  export function canReact(view: PlayerView): boolean
  /** Реакції без рядка на екрані: rowId null або rowId не серед mounted. */
  export function strayReactions(list: readonly Reaction[], mounted: ReadonlySet<string>): Reaction[]
  ```
- `useGame.ts`: новий стан `reactions: Reaction[]` і подія `socket.on('reaction', …)` → `upsertReaction`. Через `REACTION_SHOW_MS` спрацьовує `dropReaction(seq)`; таймери очищуються в cleanup ефекту. Стан скидається там само, де `setTilts({})` (новий auth, `disconnect`). Повертається поруч з `awardsSeq`.
- `live/Reactions.tsx`:
  ```ts
  type ReactionSize = 'phone' | 'stage' | 'host';
  /** Роздає реакції рядкам; поза дозволеними фазами екрани передають []. */
  export function ReactionsProvider(props: { reactions: Reaction[]; size: ReactionSize; children: ReactNode }): JSX.Element
  /** Біля ніка: реєструє rowId як «рядок на екрані» (useLayoutEffect) і малює бейджі реакцій цього rowId; поза провайдером — нічого. */
  export function RowReaction(props: { rowId: string }): JSX.Element | null
  /** Смуга внизу (position: fixed, висота --reaction-strip-h): «нік + бейдж» для strayReactions; ведучий — t('reactionHost'). */
  export function ReactionStrip(): JSX.Element
  export function ReactionBadge(props: { item: ReactionItem }): JSX.Element
  ```
  - Бейдж емодзі — `<span className="reaction-badge is-emoji" aria-label={t('reactionEmoji', { emoji })}>`. Бейдж стікера — `<span className="reaction-badge"><img src={stickerPath} alt={t('reactionSticker', { name: id })} width height /></span>`. Розмір: телефон і пульт 28 px, сцена 56 px.
  - Якщо `reaction.rowId !== reaction.by` (командна гра), поруч із бейджем пишеться `<span className="reaction-by">{nickname}</span>`.
  - Бейдж не змінює висоти рядка (фіксований розмір, `vertical-align: middle`), а довге ім'я обрізається `ellipsis`. `@keyframes reaction-pop` 200 мс; з `prefers-reduced-motion: reduce` — `animation: none`.
  - Смуга: `<div className="reaction-strip is-<size>" role="status" aria-label={t('reactionStripLabel')}>`; у ній `<span className="reaction-strip-item"><b>{nickname ?? t('reactionHost')}</b><ReactionBadge/></span>`.
- Рядки: `<RowReaction rowId={row.participantId} />` у `.name` після ніка в `Standings` і `ScoreTable`. `rowId={row.playerId}` у `SurvivalBoard` і в обох списках `WipeoutPlayers`. Рядки, що не показані (`limit`, «…і ще N»), `RowReaction` не монтують, тож їхні реакції йдуть у смугу.
- Екрани приймають `reactions?: Reaction[]` (типово `[]`). `StageScreen` / `PlayerScreen` / `HostScreen` обгортають вміст `main` у `ReactionsProvider` з `reactions={reactionAllowed(view.phase) ? reactions : []}`. У дозволених фазах `main` отримує клас `has-reactions` і в кінці — `<ReactionStrip />`. `pages/{Stage,Play,Host}.tsx` передають `game.reactions`.
- `i18n.ts`: `reactionHost` «Ведучий»; `reactionStripLabel` «Реакції»; `reactionSticker` «Стікер {name}»; `reactionEmoji` «Реакція {emoji}».
- `styles.css`: `--reaction-strip-h` (3rem / сцена 5rem); `.app.has-reactions { padding-bottom: … }`; `.has-reactions .appeal-card` на сцені піднято на висоту смуги.

- [ ] **Step 1: Write the failing tests**
  - `reactions.test.ts`:
    - `upsertReaction`: друга реакція того самого `by` замінює першу; інший `by` додається; `dropReaction` прибирає за `seq`;
    - `canReact`: `leaderboard`, `reveal`, `round_end`, `finished` → true; `question`, `locked`, `lobby` → false; `leaderboard` з `me.survival.canAnswerTrial: true` чи `canPickDoor: true` → false;
    - `strayReactions`: `rowId: null` завжди в смузі; `rowId`, що є в `mounted`, — ні.
  - `Reactions.test.tsx`:
    - `Standings` з трьома рядками в провайдері, реакція-стікер Олі → у `li` Олі `img` з `src` `/stickers/<id>.<ext>` і `alt` «Стікер <id>», а смуга порожня;
    - `Standings` з `limit={2}` і реакцією третього (Петра) → у смузі «Петро» з бейджем, у таблиці бейджа немає;
    - реакція ведучого 👏 → у смузі «Ведучий» і «👏»;
    - командна таблиця: реакція людини (`rowId` = команда, `nickname: 'Іра'`) → у рядку команди бейдж і `.reaction-by` «Іра»;
    - `ScoreTable` без провайдера з тими самими даними → жодного `.reaction-badge` і помилок немає;
    - `SurvivalBoard` з `hideEdge` → реакція гравця «на межі» йде в смугу.
  - `useGame.test.tsx` (наявний `FakeSocket`, `vi.useFakeTimers()`): подія `reaction` → `reactions` з нею; друга того самого `by` замінює; через 4000 мс — `[]`; `disconnect` → `[]`.
  - `StageScreen.test.tsx`: `leaderboard` з `reactions=[Оля, стікер]` → бейдж у рядку Олі, `main` має `has-reactions`, є `.reaction-strip`. `question` з тими самими `reactions` → ні бейджа, ні смуги, ні `has-reactions`.
  - `PlayerScreen.test.tsx`: те саме для `leaderboard` / `question` (Review Focus 1).
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/reactions.test.ts apps/web/src/live apps/web/src/screens/StageScreen.test.tsx apps/web/src/screens/PlayerScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): a reaction shows for 4 s beside the sender's name in the standings, the round summary, the podium and the survival and wipeout boards on the stage, the phones and the host console (next to the member's name on a team row), and anyone without a row on screen — the host, a trimmed or knocked-out player — appears in a fixed strip at the bottom that never covers the table

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 6. Веб: кнопка «😀 Реакція», панель вибору, улюблені й пауза 2 с

**Files:**
- Create: `apps/web/src/screens/ReactionSheet.tsx`, `ReactionSheet.test.tsx`, `apps/web/src/live/useFavoriteStickers.ts`, `useFavoriteStickers.test.tsx`
- Modify: `apps/web/src/api.ts`, `api.test.ts`, `screens/PlayerScreen.tsx`, `screens/HostScreen.tsx`, `PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `i18n.ts`, `styles.css`

**Interfaces:**
- Consumes: `QUICK_EMOJI`, `REACTION_GAP_MS`, `toggleFavorite`, `normalizeFavorites`, `reactionAllowed` (задача 2); `STICKERS`, `stickerPath` (задача 1); `canReact` (задача 5); `GET/PUT /api/me/stickers` (задача 4).
- `api.ts`:
  ```ts
  export function getFavoriteStickers(): Promise<ApiResult<{ favorites: string[] }>>
  export function saveFavoriteStickers(favorites: string[]): Promise<ApiResult<{ favorites: string[] }>>
  ```
- `useFavoriteStickers.ts`:
  ```ts
  export const GUEST_FAVORITES_KEY = 'quiz:stickers:favorites';
  /** Вантажить на першому load(): 401 — гість (localStorage, JSON-масив, normalizeFavorites), інакше — акаунт. */
  export function useFavoriteStickers(): { favorites: string[]; load: () => void; toggle: (id: string) => void }
  ```
  - `toggle` одразу оновлює стан через `toggleFavorite`. Гість пише в localStorage. Акаунт шле `saveFavoriteStickers`, а на збій повертає попередній список без тексту помилки.
  - Пошкоджений JSON у localStorage дає `[]`.
- `ReactionSheet.tsx`:
  ```ts
  /** Нижній аркуш у порталі (як PeekSheet): Escape і «Закрити» закривають; вибір шле подію й закриває аркуш. */
  export function ReactionSheet(props: { favorites: string[]; onToggle: (id: string) => void; onPick: (item: ReactionItem) => void; onClose: () => void }): JSX.Element
  /** Кнопка в шапці; ховається, коли shown false. Тримає useFavoriteStickers і паузу REACTION_GAP_MS після ok чи too_soon. */
  export function ReactionButton(props: { shown: boolean; event: 'player:react' | 'host:react'; send: Send }): JSX.Element | null
  ```
  Аркуш (`role="dialog"`, `aria-label` = `t('reactionSheetTitle')`):
  1. Рядок шести кнопок `QUICK_EMOJI`.
  2. `h3` `t('reactionFavorites')`: сітка улюблених або `t('reactionFavoritesEmpty')`.
  3. `h3` `t('reactionAll')`: прокручувана сітка всіх `STICKERS` у порядку маніфесту, `max-height: 50vh`.
  - Кожен стікер — кнопка `aria-label={t('reactionSticker', { name: id })}` з `<img loading="lazy" decoding="async" width={48} height={48}>` і поруч мала кнопка ☆ / ★ з `aria-label` `t('reactionFavoriteAdd' | 'reactionFavoriteRemove', { name: id })` і `aria-pressed`.
  - Сітка монтується лише з відкритим аркушем.
- `ReactionButton` має текст `t('reactionButton')` і `disabled`, поки йде пауза. Помилок (`wrong_phase`, `offline`) не показує, бо реакція не важлива для гри.
- Розміщення:
  - `PlayerScreen`: `<ReactionButton shown={canReact(view)} event="player:react" send={send} />` у `header.bar` перед рахунком. Кнопка не вища за рядок шапки, тож поява нічого не зсуває.
  - `HostScreen`: `shown={reactionAllowed(phase)}`, `event="host:react"`, у `header` перед кодом кімнати.
- `i18n.ts`:

  | Ключ | Текст |
  |---|---|
  | `reactionButton` | «😀 Реакція» |
  | `reactionSheetTitle` | «Реакція» |
  | `reactionFavorites` | «★ Мої улюблені» |
  | `reactionFavoritesEmpty` | «Натисни ☆ на стікері, і він з'явиться тут.» |
  | `reactionAll` | «Усі стікери» |
  | `reactionClose` | «Закрити» |
  | `reactionFavoriteAdd` | «Додати {name} в улюблені» |
  | `reactionFavoriteRemove` | «Прибрати {name} з улюблених» |

- [ ] **Step 1: Write the failing tests**
  - `ReactionSheet.test.tsx`:
    - шість кнопок емодзі; дотик 🔥 → `onPick({ kind: 'emoji', value: '🔥' })`;
    - у «Усі стікери» `STICKERS.length` кнопок-стікерів, перша — `STICKERS[0].id`, кожен `img` має `loading="lazy"` і `width="48"`;
    - дотик стікера → `onPick({ kind: 'sticker', value: id })`;
    - порожні улюблені → «Натисни ☆ на стікері, і він з'явиться тут.»;
    - `favorites=[b, a]` → у розділі улюблених порядок `b`, `a`, і ☆ на них `aria-pressed="true"`; дотик ☆ → `onToggle(id)`;
    - Escape → `onClose`.
  - `ReactionButton` (у тому ж файлі; `vi.useFakeTimers()`, `send` — мок):
    - `shown={false}` → кнопки немає;
    - відкрити, тапнути 👏 → `send('player:react', { kind: 'emoji', value: '👏' })`, аркуш закрито, кнопка `disabled`. Через 1999 мс ще `disabled`, через 2000 мс активна;
    - `send` повертає `too_soon` → теж пауза 2000 мс; `wrong_phase` → паузи немає й тексту помилки немає;
    - `event="host:react"` → `send('host:react', …)`.
  - `useFavoriteStickers.test.tsx` (`fetch`-мок як в `api.test.ts`):
    - GET 401 → гість; `toggle(a)` пише `["a"]` у `quiz:stickers:favorites`; новий хук читає `[a]`; сміття в ключі → `[]`;
    - GET 200 `{ favorites: [b] }` → `toggle(a)` дає `[a, b]` і PUT з `{ favorites: [a, b] }`; PUT 500 → повертається `[b]`.
  - `PlayerScreen.test.tsx`: «😀 Реакція» є в `leaderboard`; немає в `question`; немає в `leaderboard` з `survival.canAnswerTrial: true`.
  - `HostScreen.test.tsx`: є в `reveal`, немає в `question`; дотик → аркуш, а вибір шле `host:react`.
- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/ReactionSheet.test.tsx apps/web/src/live/useFavoriteStickers.test.tsx apps/web/src/screens/PlayerScreen.test.tsx apps/web/src/screens/HostScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implement** за Interfaces.
- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web` → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/web/src
  git commit -m "feat(web): «😀 Реакція» in the phone and host header opens a bottom sheet with six quick emoji, «★ Мої улюблені» and every sticker loaded lazily as it scrolls, ☆ keeps up to 40 favourites in the profile or, for a guest, on the device, and the buttons rest for 2 s after each reaction; nothing appears while a question is open or a survival trial waits for an answer

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```

### Задача 7. Наскрізний сценарій 13a і завантаження стікерів у R2

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Помічники беруться як є: `open`, `register`, `join`, `click`, `afterSplash`, `pickOption`, `shot`, `snapshot`, `expectNoSideScroll`, `POLL`, `exact`, `problems`, `classicRound`, `makeRoundsQuiz`.
- В обох викликах `buildApp` (`beforeAll` і `relisten`) з'являється `stickerFixtures: true`.
- `const sticker = STICKERS[0]` (з `@quiz/shared`), `const src = stickerPath(sticker)`.
- Вікторина «Реакції 13a» — один класичний раунд «Розминка» з двома запитаннями `single`, типовий `leaderboard` (таблиця після кожного запитання), без перемішування варіантів:
  - «Яка річка тече через Київ?» (Дніпро, Дністер, Десна, Південний Буг) — правильна `a`;
  - «Яке місто — столиця Буковини?» (Чернівці, Ужгород, Луцьк, Рівне) — правильна `a`.
- Екрани: пульт 1280 × 800 (`host13a`, акаунт), сцена 1280 × 720 (`stage13a`), Оля (`olya13a`, гість) і Петро (`petro13a`, гість) — 375 × 812.
- Локатори: `row(page, name) = page.locator('.standings li', { has: page.locator('.name', { hasText: name }) })`; `badgeImg(scope) = scope.locator(`.reaction-badge img[src="${src}"]`)`.

- [ ] **Step 1: Add the scenario** у кінець файлу за зразком 12i:
  ```ts
  it('part 13a: reactions — between questions Оля on a 375 phone opens «😀 Реакція», sends the first cat sticker, and it shows beside «Оля» in the 1280 × 720 stage standings and on Петро's phone for about 4 s while her button rests; the host's 👏 lands in the strip as «Ведучий»; a ☆ favourite survives a reload for a guest; and no reaction button exists while a question is open', async () => {
    try {
      await reactions13a();
    } catch (error) {
      await snapshot();
      throw error;
    }
  });
  ```
  **Кроки `reactions13a()`:**
  1. **Гра й перше запитання.**
     - Реєстрація ведучого, вікторина через `POST /api/quizzes`, «Грати», сцена за посиланням «Відкрити сцену», `join` Олі й Петра.
     - «Почати гру» → «Почати раунд» → `afterSplash`.
     - **На запитанні** кнопки «😀 Реакція» немає ні в Олі, ні в пульта (`count() === 0`).
     - Оля «Дніпро», Петро «Дністер» → «Показати відповідь» → «Далі» → `stage` у таблиці (`.standings` видно).
  2. **Стікер Олі.**
     - Оля: «😀 Реакція» → `dialog` «Реакція» → кнопка `Стікер ${sticker.id}`. Аркуш закрився, а «😀 Реакція» стоїть `disabled`.
     - Сцена: `badgeImg(row(stage, 'Оля'))` видно, `naturalWidth > 0` (фікстура намалювалась). Телефон Петра: те саме в його таблиці.
     - `expectNoSideScroll(petro, 'p13a-petro')`. Кадри `p13a-stage-badge` і `p13a-petro-badge`.
     - Таблиця сцени не прокручується: `document.documentElement.scrollHeight <= innerHeight`.
     - `expect.poll(() => olyaButton.isDisabled(), { timeout: 3000 }).toBe(false)`.
     - `expect.poll(() => badgeImg(row(stage, 'Оля')).count(), { timeout: 6000 }).toBe(0)` — після ≈4 с бейдж зник.
  3. **Смуга ведучого.** Пульт: «😀 Реакція» → «👏». На сцені й у Петра `.reaction-strip` містить «Ведучий» і «👏», а в таблиці бейджа ведучого немає. Кадр `p13a-stage-strip`.
  4. **Улюблені гостя.**
     - Оля: «😀 Реакція» → «Додати <id> в улюблені» → розділ «★ Мої улюблені» має `Стікер <id>`.
     - «Закрити» → `olya.reload()` → у таблиці знову «😀 Реакція» → аркуш: улюблений на місці. Кадр `p13a-sheet-phone` з відкритим аркушем.
     - `expectNoSideScroll(olya, 'p13a-sheet-phone')`.
  5. **Друге запитання.** «Наступне запитання» → `afterSplash` → «😀 Реакція» немає ні в Олі, ні в Петра, і `.reaction-strip` немає на сцені.
  6. `expect(problems).toEqual([])`. Тихий 401 на `/api/me/stickers` для гостя вже вважається очікуваним.
- [ ] **Step 2: Run** на передньому плані: `pnpm build`, потім `E2E_SHOTS=1 npx vitest run --config apps/server/e2e/vitest.config.ts -t "^part 13a"` → PASS. Переглянути кадри `p13a-*`:
  - бейдж поруч з ніком, а не поверх рахунку;
  - смуга внизу нічого не перекриває;
  - аркуш на 375 px вміщає три частини й прокручується всередині.
- [ ] **Step 3: Повний прогін — один раз, на передньому плані:** `npx vitest run --config apps/server/e2e/vitest.config.ts` → усі сценарії PASS. Якщо не вистачає пам'яті, прогнати групами за `-t` і сказати про це у звіті.
- [ ] **Step 4: Завантажити стікери в R2 (до пушу в `main`).**
  - З `apps/server`: `pnpm exec tsx --env-file-if-exists=../../.env scripts/upload-stickers.ts "D:\myfiles\gifs"` → `Завантажено 437 файлів.`, а `git diff packages/shared/src/sticker-list.ts` порожній.
  - Якщо `R2_*` локально немає, контролер просить власника дати ключі R2 (або запустити команду сам; покроково, за правилом «Infra step by step»). Без завантаження не пушити: у проді стікери віддавали б 404.
  - Після деплою перевірити `curl -I https://<прод>/stickers/<STICKERS[0].id>.<ext>` → 200, `image/…`.
- [ ] **Step 5: Commit**
  ```bash
  git add apps/server/e2e
  git commit -m "test: part 13a end-to-end — a guest on a 375 phone sends the first cat sticker between questions and it shows beside «Оля» on the 1280 × 720 stage and on another phone for about 4 s while her button rests, the host's 👏 lands in the bottom strip as «Ведучий», a ☆ favourite survives a reload, and no reaction button exists while a question is open

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BJmGPfDvA3k4u2NvWi6gC1"
  ```
