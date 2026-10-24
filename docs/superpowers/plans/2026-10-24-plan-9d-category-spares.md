# План 9d: запасні запитання для кожної категорії поля

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** частина 9d специфікації (розділ 6, пункт 6 власника: «Коли в полі я вибрав буст замінити питання, мені видало питання не з тієї ж категорії… в мене було поле спорт, а дало рандомне запитання»; власник вибрав «Запасні з тієї ж категорії»).
- **Кожна категорія поля має власні запасні.** У редакторі під вибраною клітинкою — розділ «Запасні категорії «Спорт»»: ті самі прості типи, що й у загальному пулі (варіанти, кілька, так/ні, текст, число), без відео, без часу, балів і підказки (бали й час — від клітинки).
- **Заміна на клітинці бере запасне з категорії цієї клітинки** — наступне невикористане. Якщо в категорії запасних немає — баф на цій клітинці неактивний з поясненням «У цій категорії немає запасних запитань.»; якщо були, але всі використано, — наявне «Запасні запитання закінчилися.».
- **Класичні раунди — як зараз**, із загального пулу «Запасні запитання».
- **Редактор не вимагає запасних у кожній категорії**, але попереджає, коли заміна ввімкнена, а в якійсь категорії їх немає (у розділі «Бафи й дебафи» — переліком, у самій категорії — рядком).
- **Старі вікторини працюють, як раніше** (правило нижче, у «Рішеннях плану»).

**Архітектура:**
- **Shared (`packages/shared/src/quiz.ts`).** `boardCategorySchema.spares?: Question[]` (1…`LIMITS.maxCategorySpares` = 5). Перевірки схеми вікторини поширюються на запасні категорій тими самими кодами: `spare_type`, `spare_video`, `duplicate_spare_ids` (id унікальні серед усіх запитань, загальних і всіх категорійних запасних). `spares_empty` — лише коли заміна ввімкнена, а запасних немає ніде (ні загальних, ні в жодній категорії). Нові функції: `categorySparesOf(quiz)`, `allSpares(quiz)`, `boardSpareSource(quiz)`. `BuffBlock` + `'no_category_spares'`. `roundQuestions`/`questionsOf` запасних категорій **не** містять (ліміт 200 запитань, поріг дуелей і лічильники не змінюються).
- **Рушій (`packages/engine/src/buffs.ts`).** `sparePool(state, play)` → `{ spares, scope: 'category' | 'quiz' }`; `nextSpare(state, play)` (новий другий аргумент); `fitBlock` для `swap`: `scope === 'category'` і пул порожній → `'no_category_spares'`, інакше вичерпаний → `'spares_out'`; `takeSpare` бере з `sparePool`. `questionFor` і `spareOf` у `views.ts` шукають запасне за id в `allSpares(quiz)`. `state.sparesUsed` — той самий спільний список id. Форма `GameState` не змінюється → `GAME_STATE_VERSION` лишається 2, `KEYS` у `restore.test.ts` без змін.
- **Сервер.** Запасні категорій живуть усередині `rounds` (jsonb колонки `quiz.rounds`) — міграції немає, `quizzes.ts` без змін (тест закріплює). Історія (`history.ts`) шукає `answer.spare_id` в `allSpares(знімок)`. Демо «Від шкільної парти до мемів» отримує по 2 запасні в кожній з 11 категорій.
- **Веб.** `SparesEditor` узагальнено (`max`, `hint`); `BoardEditor` — розділ запасних вибраної категорії, значок «⇄ N» у стовпці, попередження; `draft.ts` — чистка, проблеми й `swapGaps()`; `draft-storage.ts` — відновлення запасних категорій із чернетки; `PowersEditor` — попередження за `swapGaps`; телефон — причина `no_category_spares`; довідка й підказки бафу «Заміна запитання» згадують категорію.

**Технології:** TypeScript, zod 4, vitest, Drizzle ORM (PGlite у тестах), Fastify + Socket.IO, React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-24-after-third-game-design.md` — розділ 1 (діагноз «Заміна на полі (п. 6). Пул запасних один на всю вікторину, категорії він не знає»), розділ 6 (частина 9d), розділ 7 («запасні в категоріях» у моделі даних — на будівельнику). Зразки: `packages/engine/src/buffs.ts` (`fitBlock`, `nextSpare`, `takeSpare`, `questionFor`), `packages/engine/src/views.ts` (`spareOf`), `packages/engine/src/game.buffs-swap.test.ts`, `packages/engine/src/views.buffs-others.test.ts` (`a spare on a board cell is shown to everyone`), `packages/engine/src/testing/buffs.ts` (`toOthersCell`, `OTHERS_SPARES`), `packages/engine/src/testing/fixtures.ts` (`boardRound`), `packages/shared/src/quiz.test.ts` (`spare pool rules`, `swap needs spares…`, `describe('board round')`), `apps/server/src/history.ts` (`responsesOf`), `apps/server/src/history.test.ts` (`history: spare questions`), `apps/server/scripts/school-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`, `apps/web/src/editor/{SparesEditor.tsx, BoardEditor.tsx, PowersEditor.tsx, QuizEditor.tsx, draft.ts, draft-storage.ts}`, `apps/web/src/screens/Buffs.tsx` (`buffWhy_*`), наскрізний сценарій 8b (`sparesGame`, `takeBuff`, `tapBuff`) у `apps/server/e2e/full-game.e2e.ts`.

**Рішення плану там, де специфікація мовчить:**
- **Де зберігаються.** У самому об'єкті категорії: `category.spares` у `rounds` (jsonb). Окремої колонки, таблиці чи міграції немає; загальний пул і далі в `settings.spares` (jsonb), як з 8b.
- **Старі вікторини (головне правило).** Якщо у вікторині **немає жодної** категорії з власними запасними (усі вікторини до 9d, зокрема «Мозаїка» власника), заміна на полі бере запасні із загального пулу — як до 9d (`boardSpareSource(quiz) === 'quiz'`). Щойно хоч одна категорія будь-якого поля має власні запасні, **кожна** клітинка поля бере лише з власної категорії, без запасного варіанта із загального пулу (`'category'`); категорія без запасних — «У цій категорії немає запасних запитань.». Так власник отримує «з тієї ж категорії» без винятків, а старі вікторини не втрачають заміни на полі. Редактор показує це правило автору (див. нижче), щоб «чому на полі загальні?» не було сюрпризом.
- **Класика.** Завжди лише загальний пул; запасні категорій у класиці не використовуються ніколи. Класика без загального пулу (тепер можлива, якщо запасні є лише в категоріях) — наявна причина `spares_out` «Запасні запитання закінчилися.» (окремого коду не вводимо, щоб не міняти наявних очікувань); редактор попереджає «у класичних раундах заміни не буде — додайте загальні запасні запитання».
- **Вичерпано vs немає.** Категорія ніколи не мала запасних → `no_category_spares`; мала, але всі вже видано в цій грі → `spares_out`. Кожне запасне видається один раз за гру (спільний `sparesUsed`, як зараз).
- **Межі.** До 5 запасних на категорію (`LIMITS.maxCategorySpares`); порожній список не зберігається (ключа немає, як у старих категорій). Загальний ліміт 20 (`maxSpares`) — лише для загального пулу. Запасні категорій не входять у ліміт 200 запитань вікторини.
- **Валідація.** Ті самі коди, що й для загального пулу (`spare_type`, `spare_video`, `duplicate_spare_ids`) — редактор уже має для них речення. `spares_empty` — лише коли запасних немає зовсім.
- **Формат стану.** `GameState` і верхні ключі `Quiz` не змінюються; `BoardCategory` у `STATE_SHAPE` не відстежується, а нове поле необов'язкове. Збережені кімнати 9c (версія 2) відновлюються й грають так само (у них немає запасних категорій → загальний пул). Тому `GAME_STATE_VERSION` лишається 2 — пуш 9d ігор, що йдуть, не перериває.
- **Історія.** Відповідь на запасне категорії показується так само, як на загальне («Запасне: …»): `answer.spare_id` шукається в загальних і категорійних запасних знімка.
- **Редактор.**
  - Розділ «Запасні категорії «{назва}»» — під панеллю вибраної клітинки, завжди видимий (не згорнутий), для категорії вибраної клітинки; назва порожня → «Категорія N». Чіпи «Запасне N · тип», «Додати запасне» (вимкнено на 5), «Видалити запасне».
  - У стовпці під назвою категорії — значок «⇄ 2» (aria-label «Запасних: 2»), якщо запасні є.
  - Заміна ввімкнена: категорія без запасних, коли інші їх мають або загальних немає, — рядок «Немає запасних: на клітинках цієї категорії заміна буде недоступна.»; жодна категорія не має запасних, а загальні є — рядок «Поки жодна категорія не має власних запасних, заміна на полі бере загальні. Щойно додасте запасні хоч одній категорії, кожна братиме лише свої.».
  - «Бафи й дебафи» (заміна ввімкнена): «Заміна запитання: немає запасних у категоріях: Поле · Річки, Поле · Гори — на їхніх клітинках заміни не буде.» (назва раунду порожня → «Раунд N»); «Заміна запитання: у класичних раундах заміни не буде — додайте загальні запасні запитання.»; наявне «Заміна запитання: додайте запасні запитання» — лише коли запасних немає ніде. Попередження не блокують збереження; блокує лише `problemSparesEmpty` (немає ніде) і проблеми самих запасних («Поле: категорія «Спорт», запасне 2: …»).
  - Підказка загального пулу: «Для бафу «Заміна запитання» у класичних раундах (і на полі, поки жодна категорія не має власних запасних). Бали й час — від поточного запитання.».
- **Демо.** «Від шкільної парти до мемів» — по 2 запасні в кожній з 11 категорій (тексти — у задачі 3); загальний пул лишається (вікторина без класики, тож він тепер не використовується, але знадобиться, якщо додати класичний раунд, і тест демо його перевіряє). «Мозаїку» й інші демо не змінюємо: вони лишаються прикладом старої поведінки. Вікторини, уже засіяні в акаунт власника, не змінюються — щоб «Мозаїка» брала запасні з категорії, власник додає їх у редакторі.
- **Чого не робимо.** Автоматичного перенесення загальних запасних у категорії; запасного варіанта «категорія порожня → загальний пул» у новому режимі; запасних для бліцу, фіналу й дуелей (бафів там немає); вибору запасного гравцем.

## Глобальні обмеження

- Рушій чистий: жодного годинника; `sparePool` — функція стану.
- Анти-ціль «правильна відповідь потрапляє раніше розкриття»: запасні категорій не з'являються в зрізах поля (`boardView` будує категорії явним переліком полів — тест задачі 2 це закріплює) і не потрапляють у `PlayerView`/`StageView` до заміни.
- Старі вікторини (без `category.spares`) поводяться точно як до 9d: наявні тести `game.buffs-swap.test.ts`, `views.buffs-others.test.ts`, `game.buffs-others.test.ts` і сценарій 8b не змінюються.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`.
- Кожна задача з логікою починається з тесту, що падає. Перед комітом зелені `pnpm typecheck` і `pnpm vitest run --maxWorkers=2` (якщо PGlite падає з браком пам'яті — окремо `pnpm vitest run --maxWorkers=2 packages`, `pnpm vitest run --maxWorkers=1 apps/server`, `pnpm vitest run --maxWorkers=2 apps/web`).
- Наскрізні тести: спершу `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Кадри — з `E2E_SHOTS=1` у `apps/server/e2e/artifacts/shots`.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (проєкт тестовий).

## Карта файлів

| Файл | Що змінюється | Задача |
|---|---|---|
| `packages/shared/src/quiz.ts`, `packages/shared/src/quiz.test.ts` | `LIMITS.maxCategorySpares`, `boardCategorySchema.spares`, перевірки, `categorySparesOf`, `allSpares`, `boardSpareSource` | 1 |
| `packages/shared/src/game.ts` | `BuffBlock` + `'no_category_spares'` | 1 |
| `apps/web/src/i18n.ts` | `buffWhy_no_category_spares` (решта текстів — задачі 4–5) | 1 |
| `packages/engine/src/buffs.ts` | `sparePool`, `nextSpare(state, play)`, `fitBlock`, `takeSpare`, `questionFor` | 2 |
| `packages/engine/src/views.ts` | `spareOf` через `allSpares` | 2 |
| `packages/engine/src/testing/fixtures.ts` | `boardRound`: необов'язкові `spares` категорії | 2 |
| `packages/engine/src/game.buffs-category-spares.test.ts` (новий) | правила пулу, зрізи, JSON-збереження | 2 |
| `apps/server/src/history.ts`, `apps/server/src/history.test.ts`, `apps/server/src/quizzes.test.ts` | `allSpares` у відповідях; збереження запасних категорій | 3 |
| `apps/server/scripts/school-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts` | по 2 запасні в кожній категорії | 3 |
| `apps/web/src/editor/SparesEditor.tsx`, `BoardEditor.tsx`, `BoardEditor.test.tsx` (новий), `PowersEditor.tsx`, `PowersEditor.test.tsx`, `QuizEditor.tsx`, `draft.ts`, `draft.test.ts`, `draft-storage.ts`, `draft-storage.test.ts` (наявний або новий), `apps/web/src/i18n.ts`, `apps/web/src/styles.css` | редактор запасних категорій і попередження | 4 |
| `apps/web/src/screens/Buffs.test.tsx`, `apps/web/src/i18n.ts` | причина на телефоні, довідка й підказка «Заміни» | 5 |
| `apps/server/e2e/full-game.e2e.ts` | сценарій 9d | 6 |

## Порядок збирання

- Задача 1 — перша. Задача 2 — на 1. Задача 3 — на 1 (історія — лише `allSpares`; рушій не потрібен). Задача 4 — на 1. Задача 5 — на 1 (текст причини) і 2 (зріз дає причину). Задача 6 — остання.
- Навмисні зміни наявних очікувань (лише такі): `quiz.test.ts` — жодних (наявні `spare pool rules` і `swap needs spares…` лишаються зеленими); тести, що викликають `nextSpare(state)` з одним аргументом (зараз таких немає — перевірити `grep -rn "nextSpare(" packages`), отримують `play`; тексти `sparesHint`, `buffWhere_swap`, `buffTip_swap` змінюються — тести, що порівнюють їх буквально, читають їх через `t(...)`; якщо десь буквальний рядок (наприклад, у сценаріях e2e) — оновити на новий текст.

## На що дивитися рецензентові

1. **Та сама категорія, без підміни.** У режимі `'category'` клітинка ніколи не бере загальних запасних і запасних інших категорій. Тести: задача 2, `a board cell swaps to the next spare of its own category`, `a category without spares disables swap on its cells — no fallback to the global pool`.
2. **Старі вікторини не змінилися.** Без жодних запасних категорій поле бере загальний пул; класика — завжди загальний. Тести: задача 2, `a quiz without category spares keeps the global pool on the board (legacy)`, `classic rounds always use the global pool`; наявні тести 8b без змін.
3. **Відповідь не витікає.** Запасні категорій не з'являються в жодному зрізі до заміни. Тест: задача 2, `category spares never leak into views before a swap`.
4. **Історія й демо.** Відповідь на запасне категорії видно в історії; школа має по 2 запасні в кожній категорії й проходить схему. Тести: задача 3.
5. **Редактор попереджає, але не блокує.** Тести: задача 4, `swapGaps lists categories without spares…`, `a quiz with spares only in categories saves`.

---

### Задача 1. Shared: запасні в категорії поля, перевірки, пошук запасних і причина `no_category_spares`

**Files:**
- Modify: `packages/shared/src/quiz.ts` (`LIMITS`, `boardCategorySchema`, `quizSchema.superRefine`, нові функції)
- Modify: `packages/shared/src/game.ts` (`BuffBlock`)
- Modify: `apps/web/src/i18n.ts` (`buffWhy_no_category_spares`)
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Produces (`quiz.ts`):
  ```ts
  // у LIMITS, поруч із maxSpares:
  /** Запасних в одній категорії поля (9d). */
  maxCategorySpares: 5,

  export const boardCategorySchema = z.object({
    id: …, title: …, cells: …,
    /** Запасні цієї категорії для «Заміни запитання» (9d); старі категорії без поля. */
    spares: z.array(questionSchema).min(1).max(LIMITS.maxCategorySpares).optional(),
  });

  /** Запасні всіх категорій усіх полів у порядку раундів і категорій. */
  export function categorySparesOf(quiz: Pick<Quiz, 'rounds'>): Question[];
  /** Усі запасні вікторини (загальні, потім категорій) — для пошуку запасного за id у грі й історії. */
  export function allSpares(quiz: Pick<Quiz, 'rounds' | 'spares'>): Question[];
  /**
   * Звідки заміна на полі бере запасне: 'category' — хоч одна категорія має власні запасні (9d),
   * тоді кожна клітинка бере лише зі своєї категорії; 'quiz' — жодна не має (вікторини до 9d), загальний пул.
   */
  export function boardSpareSource(quiz: Pick<Quiz, 'rounds'>): 'category' | 'quiz';
  ```
  У `superRefine`: `const pools = [...(quiz.spares ?? []), ...categorySparesOf(quiz)]`; `spare_type` / `spare_video` перевіряються для `pools`; `duplicate_spare_ids` — для `[...questions.map(id), ...pools.map(id)]`; `spares_empty` — `buffs?.includes('swap') && pools.length === 0`.
- Produces (`game.ts`): `BuffBlock` + `| 'no_category_spares'` (коментар: «на полі: у категорії клітинки немає власних запасних (9d)»).
- i18n: `buffWhy_no_category_spares: 'У цій категорії немає запасних запитань.'`.

- [ ] **Step 1: Write the failing tests** у `quiz.test.ts`, усередині `describe('board round', …)` (там є `category`, `board`, `boardQuiz`); `spareSingle` і `orderSpare` з нижньої частини файлу підняти на верхній рівень файлу, щоб їх бачили обидва блоки:
  ```ts
  describe('category spares (9d)', () => {
    const spare = (id: string, patch: object = {}) => ({ ...spareSingle, id, ...patch });
    const withSpares = (spares: object[] | undefined, patch: object = {}) =>
      boardQuiz([board([category('c1', 3, spares === undefined ? {} : { spares }), category('c2', 3), category('c3', 3)])]) as object & { settings: object };
    const swapOn = (quiz: object & { settings: object }) => ({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } });

    it('an old category has no spares; a category may hold 1…5 simple spares', () => {
      const old = quizSchema.parse(withSpares(undefined));
      expect(old.rounds[0].type === 'board' && old.rounds[0].categories[0].spares).toBeUndefined();
      expect(valid(quizSchema, withSpares([spare('cs1')]))).toBe(true);
      expect(valid(quizSchema, withSpares(Array.from({ length: LIMITS.maxCategorySpares }, (_, i) => spare(`cs${i}`))))).toBe(true);
      expect(valid(quizSchema, withSpares(Array.from({ length: LIMITS.maxCategorySpares + 1 }, (_, i) => spare(`cs${i}`))))).toBe(false);
      expect(valid(quizSchema, withSpares([]))).toBe(false);
    });

    it('category spares follow the pool rules: simple types, no video, unique ids everywhere', () => {
      expect(issues(withSpares([{ ...orderSpare, id: 'cs1' }]))).toContain('spare_type');
      expect(issues(withSpares([spare('cs1', { video: { id: 'dQw4w9WgXcQ', start: 0 } })]))).toContain('spare_video');
      expect(issues(withSpares([spare('cs1'), spare('cs1')]))).toContain('duplicate_spare_ids');
      // Збіг з id клітинки й із загальним запасним.
      expect(issues(withSpares([spare('q-c2-0')]))).toContain('duplicate_spare_ids');
      expect(issues({ ...withSpares([spare('cs1')]), spares: [spare('cs1')] })).toContain('duplicate_spare_ids');
    });

    it('swap is valid with spares only in categories; spares_empty only when there are none at all', () => {
      expect(issues(swapOn(withSpares(undefined)))).toContain('spares_empty');
      expect(valid(quizSchema, swapOn(withSpares([spare('cs1')])))).toBe(true);
      expect(valid(quizSchema, { ...swapOn(withSpares(undefined)), spares: [spare('s1')] })).toBe(true);
    });

    it('category spares are not questions of the quiz', () => {
      const parsed = quizSchema.parse(withSpares([spare('cs1')]));
      expect(questionsOf(parsed).map((q) => q.id)).not.toContain('cs1');
      expect(questionsOf(parsed)).toHaveLength(9);
    });

    it('allSpares, categorySparesOf and boardSpareSource', () => {
      const legacy = quizSchema.parse({ ...withSpares(undefined), spares: [spare('s1')] });
      expect(boardSpareSource(legacy)).toBe('quiz');
      expect(categorySparesOf(legacy)).toEqual([]);
      expect(allSpares(legacy).map((q) => q.id)).toEqual(['s1']);
      const mixed = quizSchema.parse({ ...withSpares([spare('cs1'), spare('cs2')]), spares: [spare('s1')] });
      expect(boardSpareSource(mixed)).toBe('category');
      expect(categorySparesOf(mixed).map((q) => q.id)).toEqual(['cs1', 'cs2']);
      expect(allSpares(mixed).map((q) => q.id)).toEqual(['s1', 'cs1', 'cs2']);
    });
  });
  ```
  (`issues(quiz)` і `valid(schema, value)` — наявні помічники файлу; імпорти `allSpares`, `categorySparesOf`, `boardSpareSource` — з `./index`.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/shared`. Очікується FAIL: немає `allSpares`/`categorySparesOf`/`boardSpareSource`, `spares` категорії відкидається zod-ом як зайвий ключ або не перевіряється, `spares_empty` спрацьовує при запасних лише в категоріях.

- [ ] **Step 3: Implement** за Interfaces. `categorySparesOf`: `quiz.rounds.flatMap((r) => (r.type === 'board' ? r.categories.flatMap((c) => c.spares ?? []) : []))`. `boardSpareSource`: `categorySparesOf(quiz).length > 0 ? 'category' : 'quiz'`. Функції оголосити після `boardCells`/`findCell` (вони потрібні рушію разом). `BuffBlock` — додати в останній рядок переліку.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages`. Очікується PASS (рушій новий код причини ще не повертає; вичерпних `switch` за `BuffBlock` немає — якщо є, додати гілку).

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/web/src/i18n.ts
git commit -m "feat(shared): spares of a board category (up to 5, simple types, no video, unique ids), spares_empty only with no spares anywhere, allSpares/categorySparesOf/boardSpareSource, the no_category_spares reason"
```

---

### Задача 2. Рушій: заміна на клітинці бере запасне своєї категорії

**Files:**
- Modify: `packages/engine/src/buffs.ts` (`sparePool`, `nextSpare`, `fitBlock`, `takeSpare`, `questionFor`)
- Modify: `packages/engine/src/views.ts` (`spareOf`)
- Modify: `packages/engine/src/testing/fixtures.ts` (`boardRound`)
- Create: `packages/engine/src/game.buffs-category-spares.test.ts`

**Interfaces:**
- Produces (`buffs.ts`):
  ```ts
  /**
   * Пул заміни для запитання play: клітинка поля — запасні її категорії, якщо вікторина в режимі 'category'
   * (порожній список, якщо в категорії їх немає); інакше — загальний пул (класика завжди, поле старих вікторин).
   */
  export function sparePool(state: GameState, play: Play): { spares: Question[]; scope: 'category' | 'quiz' };
  /** Наступне невикористане запасне з пулу play; null — пулу немає або він вичерпаний. */
  export function nextSpare(state: GameState, play: Play): Question | null;
  ```
  `sparePool`: `const round = state.quiz.rounds[play.roundIndex]; if (play.board !== undefined && round.type === 'board' && boardSpareSource(state.quiz) === 'category') return { spares: findCell(round, play.board.cellId)?.category.spares ?? [], scope: 'category' }; return { spares: state.quiz.spares ?? [], scope: 'quiz' };`
  `fitBlock`, гілка `swap`:
  ```ts
  case 'swap': {
    const { spares, scope } = sparePool(state, play);
    if (scope === 'category' && spares.length === 0) return 'no_category_spares';
    return nextSpare(state, play) === null ? 'spares_out' : null;
  }
  ```
  `takeSpare`: `const spare = nextSpare(state, play);`. `questionFor`: `allSpares(state.quiz).find((q) => q.id === spare.id) ?? play.question`. `views.ts` `spareOf`: `allSpares(state.quiz).find(…)`.
- Produces (`fixtures.ts`): `boardRound(id, categories: { title; cells; spares?: Question[] }[], options)` — категорія отримує `...(spares === undefined ? {} : { spares })`.

- [ ] **Step 1: Write the failing tests** у новому `game.buffs-category-spares.test.ts`:
  ```ts
  import type { Answer, BuffKind, Question } from '@quiz/shared';
  import { describe, expect, it } from 'vitest';
  import { pickCell } from './board';
  import { buffBlock, questionFor, sparePool, takeBuff } from './buffs';
  import { acceptAnswer, next, recordOf, start, submitAnswer, type GameState } from './game';
  import { T0 } from './testing/buffs';
  import { boardRound, bool, classicRound, makeRoundsQuiz, numeric, single4, text, withId } from './testing/fixtures';
  import { lobbyWith, must, startRound } from './testing/helpers';
  import { hostView, playerView, stageView } from './views';

  const rng0 = () => 0;
  const yes: Answer = { type: 'boolean', value: true };
  const take = (s: GameState, id: string, kind: BuffKind, at: number) => must(takeBuff(s, id, kind, at, rng0));
  const GLOBAL = [{ ...text, id: 's1', text: 'Яке місто стоїть на Пруті?', accepted: ['Чернівці'] }];
  const SPORT = [{ ...withId(bool, 'sp1'), text: 'Футбольний м’яч — круглий?' }, { ...withId(numeric, 'sp2'), text: 'Скільки гравців у волейбольній команді?' }];
  const CITIES = [{ ...withId(bool, 'ct1'), text: 'Львів — обласний центр?' }];

  /** Поле Спорт (s1x) / Міста (m1x) / Річки (r1x) по 3 клітинки single4; запасні категорій — за аргументами; Оля p1, Петро p2, Іра p3; Оля вибирає cellId о T0. */
  function toCell(cellId: string, pools: { sport?: Question[]; cities?: Question[]; global?: Question[] } = { sport: SPORT, cities: CITIES, global: GLOBAL }): GameState {
    const cells = (prefix: string) => [1, 2, 3].map((j) => withId(single4, `${prefix}${j}`));
    const round = boardRound(
      'g1',
      [
        { title: 'Спорт', cells: cells('s'), spares: pools.sport },
        { title: 'Міста', cells: cells('m'), spares: pools.cities },
        { title: 'Річки', cells: cells('r') },
      ],
      { check: 'auto', answerMode: 'phone' },
    );
    const base = makeRoundsQuiz([round], { leaderboard: 'end', buffs: ['swap'] });
    const quiz = pools.global === undefined ? base : { ...base, spares: pools.global };
    return must(pickCell(must(next(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'))), T0)), 'p1', cellId, T0, rng0));
  }

  describe('swap on the board takes a spare of the same category (9d)', () => {
    it('a board cell swaps to the next spare of its own category, not the global pool', () => {
      let s = take(toCell('s2'), 'p1', 'swap', T0 + 1000);
      expect(s.plays[0].buffs?.p1.spare?.id).toBe('sp1');
      expect(s.sparesUsed).toEqual(['sp1']);
      expect(questionFor(s, s.plays[0], 'p1').text).toBe('Футбольний м’яч — круглий?');
      s = must(submitAnswer(s, 'p1', yes, T0 + 2000));
      s = must(acceptAnswer(s, 'p1', T0 + 3000));
      expect(recordOf(s, 0, 'p1')).toMatchObject({ accepted: true, spare: 'sp1', buff: 'swap' });
    });

    it('the next spare of a category skips the used ones; another category keeps its own', () => {
      const s = toCell('s1');
      expect(sparePool(s, s.plays[0])).toEqual({ spares: SPORT, scope: 'category' });
      const used = { ...s, sparesUsed: ['sp1'] };
      expect(take(used, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('sp2');
      expect(buffBlock({ ...s, sparesUsed: ['sp1', 'sp2'] }, 'p1', 'swap')).toBe('spares_out');
      const cities = toCell('m1');
      expect(take({ ...cities, sparesUsed: ['sp1', 'sp2'] }, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('ct1');
    });

    it('a category without spares disables swap on its cells — no fallback to the global pool', () => {
      const s = toCell('r1');
      expect(sparePool(s, s.plays[0])).toEqual({ spares: [], scope: 'category' });
      expect(buffBlock(s, 'p1', 'swap')).toBe('no_category_spares');
      expect(takeBuff(s, 'p1', 'swap', T0 + 1000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
      expect(playerView(s, 'p1')?.me.buffs?.slots.find((b) => b.kind === 'swap')?.block).toBe('no_category_spares');
    });

    it('a quiz without category spares keeps the global pool on the board (legacy)', () => {
      const s = toCell('r1', { global: GLOBAL });
      expect(sparePool(s, s.plays[0]).scope).toBe('quiz');
      expect(take(s, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('s1');
    });

    it('classic rounds always use the global pool, even when categories have spares', () => {
      const board = boardRound('g1', [
        { title: 'Спорт', cells: [1, 2, 3].map((j) => withId(single4, `s${j}`)), spares: SPORT },
        { title: 'Міста', cells: [1, 2, 3].map((j) => withId(single4, `m${j}`)) },
        { title: 'Річки', cells: [1, 2, 3].map((j) => withId(single4, `r${j}`)) },
      ]);
      const quiz = { ...makeRoundsQuiz([classicRound('r1', [withId(single4, 'q1')]), board], { buffs: ['swap'] }), spares: GLOBAL };
      const s = startRound(lobbyWith(quiz, 'Оля'), T0, rng0);
      expect(take(s, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('s1');
      // Без загального пулу класика не бере категорійних: та сама причина, що й раніше.
      const { spares: _gone, ...noPool } = quiz;
      expect(buffBlock(startRound(lobbyWith(noPool, 'Оля'), T0, rng0), 'p1', 'swap')).toBe('spares_out');
    });

    it('the stage, phones and host show the category spare; category spares never leak into views before a swap', () => {
      const before = toCell('s1');
      for (const view of [stageView(before), playerView(before, 'p1'), playerView(before, 'p2'), hostView(before)]) {
        expect(JSON.stringify(view)).not.toContain('Футбольний');
        expect(JSON.stringify(view)).not.toContain('Львів — обласний');
      }
      const s = take(before, 'p1', 'swap', T0 + 1000);
      for (const view of [stageView(s), playerView(s, 'p1'), playerView(s, 'p2')]) expect(view?.question?.text).toBe('Футбольний м’яч — круглий?');
      expect(hostView(s).correct).toMatchObject({ id: 'sp1', correct: true });
      const answered = must(acceptAnswer(must(submitAnswer(s, 'p1', yes, T0 + 2000)), 'p1', T0 + 3000));
      expect(hostView(answered).responses[0].spare).toMatchObject({ id: 'sp1' });
      expect(stageView(answered).reveal).toMatchObject({ id: 'sp1' });
    });

    it('a state saved as JSON and read back keeps the category pools (no state format change)', () => {
      const restored = JSON.parse(JSON.stringify(toCell('s1'))) as GameState;
      expect(take(restored, 'p1', 'swap', T0 + 1000).plays[0].buffs?.p1.spare?.id).toBe('sp1');
    });
  });
  ```
  (Якщо в `fixtures.ts` немає `numeric`/`text`/`classicRound` під цими іменами — узяти наявні, якими користуються `game.buffs-swap.test.ts` і `testing/buffs.ts`; шлях до причини в `PlayerView` — той самий, що в `views.buffs.test.ts`: поле `me.buffs.slots[].block`.)

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 packages/engine/src/game.buffs-category-spares.test.ts`. Очікується FAIL: `sparePool` немає, клітинка Спорту отримує `s1` із загального пулу, на Річках `null` замість `no_category_spares`.

- [ ] **Step 3: Implement** за Interfaces. Імпорти `allSpares`, `boardSpareSource`, `findCell` — з `@quiz/shared`. `grep -rn "nextSpare(" packages apps` — оновити всі виклики на `(state, play)`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 packages`. Очікується PASS, включно з незміненими `game.buffs-swap.test.ts`, `game.buffs-others.test.ts`, `views.buffs-others.test.ts` і `restore.test.ts` (`the state format is pinned to GAME_STATE_VERSION` — без змін, бо `GameState` і ключі `Quiz` ті самі).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): swap on a board cell takes the next spare of the cell's category (no_category_spares when it has none, no fallback); quizzes without category spares keep the global pool; classic always global"
```

---

### Задача 3. Сервер: історія знаходить запасні категорій, збереження вікторини, демо «Від шкільної парти до мемів»

**Files:**
- Modify: `apps/server/src/history.ts` (`responsesOf` отримує `allSpares(quiz)`)
- Modify: `apps/server/src/history.test.ts`, `apps/server/src/quizzes.test.ts`
- Modify: `apps/server/scripts/school-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`

**Interfaces:**
- `history.ts`: `responses: responsesOf(given, standings, quiz === null ? [] : allSpares(quiz))` (імпорт `allSpares` з `@quiz/shared`).
- `quizzes.ts` — без змін: `category.spares` живе в `rounds` (jsonb) і проходить `quizSchema` при читанні.

- [ ] **Step 1: Write the failing tests.**
  - `history.test.ts`, у `describe('history: spare questions')`:
    ```ts
    it('responses carry a spare of a board category', async () => {
      const host = await signUp(ctx.app, 'Ведуча');
      const [account] = await db.select().from(user).where(eq(user.email, host.email));
      const spare = { ...text, id: 'cs1', text: 'Запасне зі Спорту?' };
      const cells = (p: string) => [1, 2, 3].map((j) => withId(single, `${p}${j}`));
      const round = boardRound('g1', [
        { title: 'Спорт', cells: cells('s'), spares: [spare] },
        { title: 'Міста', cells: cells('m') },
        { title: 'Річки', cells: cells('r') },
      ]);
      const { gameId } = await seedGame(db, {
        hostId: account.id,
        startedAt: new Date(2026, 1, 1),
        snapshot: makeRoundsQuiz([round], { buffs: ['swap'] }),
        players: [{ userId: null, nickname: 'Олена', score: 100, rank: 1, rows: [{ questionIndex: 0, accepted: true, points: 100, buff: 'swap', spareId: 'cs1' }] }],
      });
      const detail = await hostGame(db, account.id, gameId);
      expect(detail?.questions[0].responses[0].spare?.text).toBe('Запасне зі Спорту?');
    });
    ```
    (`boardRound`, `makeRoundsQuiz`, `withId` — з того самого модуля фікстур, звідки файл уже бере `makeQuiz`, `single`, `text`.)
  - `quizzes.test.ts`: `it('keeps the spares of board categories', …)` — `createQuiz` вікторини з полем, у першій категорії `spares: [cs1]`, `getQuiz` повертає ту саму категорію з `spares` (`toEqual`); вікторина без запасних категорій повертається без ключа `spares` у категоріях (`'spares' in category` — false).
  - `demo-quiz.test.ts`, у `describe('the school quiz')`:
    ```ts
    it('every board category has two spares of simple types, each answerable', () => {
      const categories = boards.flatMap((b) => (b.type === 'board' ? b.categories : []));
      expect(categories).toHaveLength(11);
      for (const category of categories) {
        expect(category.spares?.length, category.title).toBe(2);
        for (const spare of category.spares ?? []) expect(['single', 'multi', 'boolean', 'text', 'numeric']).toContain(spare.type);
      }
      expect(boardSpareSource(schoolQuiz)).toBe('category');
    });
    ```
    і в наявному тесті збереження школи — `expect(loaded?.rounds).toEqual(quizSchema.parse(schoolQuiz).rounds)`.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=1 apps/server/src/history.test.ts apps/server/src/quizzes.test.ts apps/server/scripts`. Очікується FAIL: історія дає `spare: null` для `cs1`; у школи немає запасних категорій. (`quizzes.test.ts` може пройти одразу — це закріплення поведінки, не нова логіка.)

- [ ] **Step 3: Implement.** `history.ts` — за Interfaces. `school-quiz.ts`: у кожну категорію після `cells` — `spares: [...]` (помічники `single`, `bool`, `numeric`, `textQ` з `./demo-quiz`; бали 300 й час 40 — як у загальних запасних, вони однаково беруться з клітинки). Тексти:
  - Математика: `single('Скільки буде 15 % від 200?', ['30', '15', '20', '35'], 0, 300, 40)`, `numeric('Скільки сантиметрів в одному метрі?', 100, 0, 300, 40)`
  - Географія: `single('Яка найдовша річка України?', ['Дніпро', 'Дністер', 'Південний Буг', 'Десна'], 0, 300, 40)`, `bool('Австралія — це і країна, і континент.', true, 300, 30)`
  - Історія: `numeric('У якому році Україна проголосила незалежність?', 1991, 0, 300, 40)`, `single('Яке місто було столицею Київської Русі?', ['Київ', 'Новгород', 'Чернігів', 'Галич'], 0, 300, 40)`
  - Біологія: `single('Який орган качає кров по тілу?', ['Серце', 'Печінка', 'Легені', 'Нирки'], 0, 300, 40)`, `numeric('Скільки ніг у павука?', 8, 0, 300, 40)`
  - Зарубіжна література: `textQ('Хто написав «Ромео і Джульєтту»?', ['Шекспір', 'Вільям Шекспір'], 300, 45)`, `single('Як звали капітана «Наутілуса» в романах Жуля Верна?', ['Немо', 'Гаттерас', 'Грант', 'Флінт'], 0, 300, 40)`
  - Кіно: `single('Як звати хлопчика-чарівника зі шрамом у вигляді блискавки?', ['Гаррі Поттер', 'Рон Візлі', 'Драко Мелфой', 'Невіл Лонгботом'], 0, 300, 40)`, `bool('«Титанік» Джеймса Кемерона отримав «Оскар» як найкращий фільм.', true, 300, 30)`
  - Серіали: `single('У якому місті живуть герої серіалу «Друзі»?', ['Нью-Йорк', 'Лос-Анджелес', 'Чикаго', 'Бостон'], 0, 300, 40)`, `textQ('Як звати вчителя хімії — головного героя «Пуститися берега»?', ['Волтер Вайт', 'Волтер', 'Гайзенберг', 'Хайзенберг'], 300, 45)`
  - Поп-культура: `single('Хто виконує пісню «Shake It Off»?', ['Тейлор Свіфт', 'Леді Гага', 'Адель', 'Ріанна'], 0, 300, 40)`, `bool('Гурт «Океан Ельзи» заснували у Львові.', true, 300, 30)`
  - Мультфільми: `single('Як звати сніговика з мультфільму «Крижане серце»?', ['Олаф', 'Свен', 'Крістофф', 'Ганс'], 0, 300, 40)`, `textQ('Як звати жовту губку, що живе в ананасі на дні океану?', ['Губка Боб', 'Спанч Боб', 'SpongeBob'], 300, 45)`
  - Меми: `bool('Собака з мему «Doge» — породи шиба-іну.', true, 300, 30)`, `single('Яка тварина летить веселкою в мемі «Nyan Cat»?', ['Кіт', 'Собака', 'Жаба', 'Хом’як'], 0, 300, 40)`
  - Культурні явища: `single('Яке місто приймало «Євробачення-2017»?', ['Київ', 'Лісабон', 'Стокгольм', 'Тель-Авів'], 0, 300, 40)`, `bool('Петриківський розпис внесено до списку нематеріальної спадщини ЮНЕСКО.', true, 300, 30)`

  Коментар над загальним `spares` школи: «Загальні запасні — для класичних раундів; на полі кожна категорія має власні (9d).» Опис у JSDoc вікторини: «…запасні запитання в кожній категорії…».

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=1 apps/server`. Очікується PASS (зокрема `demo-quiz.test.ts`: школа валідна, загальний пул той самий, кількість запитань без змін).

- [ ] **Step 5: Commit**

```bash
git add apps/server
git commit -m "feat(server): the history finds spares of board categories; category spares round-trip in rounds; the school demo gets two spares in each of its 11 categories"
```

---

### Задача 4. Веб-редактор: запасні в категорії поля й попередження

**Files:**
- Modify: `apps/web/src/editor/SparesEditor.tsx` (пропси `max`, `hint`)
- Modify: `apps/web/src/editor/BoardEditor.tsx` (розділ запасних категорії, значок «⇄ N», пропси `swapOn`, `legacySpares`)
- Create: `apps/web/src/editor/BoardEditor.test.tsx`
- Modify: `apps/web/src/editor/draft.ts` (`cleaned`, `problemsOf`, `swapGaps`)
- Modify: `apps/web/src/editor/draft.test.ts`
- Modify: `apps/web/src/editor/draft-storage.ts` (`reviveCategory`) і його тест (наявний `draft-storage.test.ts` або той, що тестує `loadDraft`)
- Modify: `apps/web/src/editor/PowersEditor.tsx`, `PowersEditor.test.tsx` (пропс `gaps`)
- Modify: `apps/web/src/editor/QuizEditor.tsx` (передає `swapOn`, `legacySpares`, `gaps`)
- Modify: `apps/web/src/i18n.ts`, `apps/web/src/styles.css`

**Interfaces:**
- `SparesEditor`: `max?: number` (типово `LIMITS.maxSpares`), `hint?: string` (типово `t('sparesHint')`).
- `BoardEditor` Props: `/** Чи ввімкнена «Заміна запитання» (для попереджень). */ swapOn?: boolean;` `/** Жодна категорія не має запасних, а загальні є: поле бере загальні. */ legacySpares?: boolean;`
- `draft.ts`:
  ```ts
  export interface SwapGaps {
    /** Хоч одна категорія має власні запасні. */
    anyCategory: boolean;
    /** Категорії без власних запасних, коли поле в режимі категорій: «Поле · Річки» (назва раунду порожня — «Раунд N», категорії — «Категорія N»). */
    emptyCategories: string[];
    /** Є класичний раунд, а загального пулу немає. */
    classicWithoutPool: boolean;
    /** Є поле, жодна категорія не має запасних, а загальні є: поле бере загальні. */
    legacyBoard: boolean;
  }
  /** Де «Заміна запитання» не матиме запасного; не блокує збереження. */
  export function swapGaps(quiz: Quiz): SwapGaps;
  ```
  `emptyCategories` наповнюється, коли `anyCategory` або немає загальних (тобто коли поле не бере загального пулу).
- `cleaned`: категорія — `spares` через `cleanQuestion`, порожній список → ключ прибрано.
- `problemsOf`: для кожної категорії — проблеми запасних тим самим `problemKey`: `where(t('problemCategorySpare', { category: name, index, problem }))`; `problemSparesEmpty` — `swap && draft.spares === undefined && categorySparesOf(draft).length === 0`.
- `draft-storage.ts` `reviveCategory`: `const { spares, ...rest } = category; return { ...rest, cells: …, ...reviveSpares(spares) }`.
- `PowersEditor`: `gaps?: SwapGaps`; `powersSwapNeedsSpares` — лише коли `spares` порожній і `!gaps?.anyCategory`; далі (заміна ввімкнена) `powersSwapCategoriesEmpty` з `{ list: gaps.emptyCategories.join(', ') }`, `powersSwapClassicEmpty`, `powersSwapLegacyBoard` (клас `meta`, не `powers-warn`).
- i18n:
  ```ts
  categorySparesTitle: 'Запасні категорії «{title}»',
  categorySparesHint: 'Для «Заміни запитання» на клітинках цієї категорії: гравець отримає наступне запасне саме звідси. Бали й час — від клітинки.',
  categorySparesNone: 'Немає запасних: на клітинках цієї категорії заміна буде недоступна.',
  categorySparesLegacy: 'Поки жодна категорія не має власних запасних, заміна на полі бере загальні. Щойно додасте запасні хоч одній категорії, кожна братиме лише свої.',
  categorySparesBadge: 'Запасних: {count}',
  problemCategorySpare: 'Категорія «{category}», запасне {index}: {problem}',
  powersSwapCategoriesEmpty: 'Заміна запитання: немає запасних у категоріях: {list} — на їхніх клітинках заміни не буде.',
  powersSwapClassicEmpty: 'Заміна запитання: у класичних раундах заміни не буде — додайте загальні запасні запитання.',
  powersSwapLegacyBoard: 'На полі заміна поки бере загальні запасні: жодна категорія не має власних.',
  // змінити:
  sparesHint: 'Для бафу «Заміна запитання» у класичних раундах (і на полі, поки жодна категорія не має власних запасних). Бали й час — від поточного запитання.',
  ```

- [ ] **Step 1: Write the failing tests.**
  - `draft.test.ts`:
    ```ts
    describe('category spares in the draft (9d)', () => {
      it('cleaned drops an empty category pool and trims category spares', () => { /* категорія зі spares: [] → без ключа; spares з текстом «  Так?  » → «Так?» */ });
      it('a quiz with spares only in categories saves; problems of a category spare name the category', () => {
        // swap увімкнено, загальних немає, у «Спорт» одне правильне запасне → problemsOf(quiz) === []
        // запасне без тексту → проблема, що містить «Категорія «Спорт», запасне 1:»
        // swap увімкнено, запасних немає ніде → містить t('problemSparesEmpty')
      });
      it('swapGaps lists categories without spares, a classic round without the pool and the legacy board', () => {
        // поле «Поле»: Спорт зі spares, Міста й Річки без → emptyCategories ['Поле · Міста', 'Поле · Річки'], anyCategory true
        // + класичний раунд без загального пулу → classicWithoutPool true
        // поле без запасних категорій + загальний пул → legacyBoard true, emptyCategories []
        // поле без жодних запасних і без загальних → emptyCategories містить усі три категорії
      });
    });
    ```
    (Вікторини збирати наявними помічниками `draft.test.ts` (`newBoardRound`, `newClassicRound`, `newSpare`), заповнюючи назви й тексти так, щоб інших проблем не було — як у наявних тестах `problemsOf` для поля.)
  - `BoardEditor.test.tsx` (новий): рендер `BoardEditor` з полем із трьох названих категорій і `onChange = vi.fn()`:
    1. `it('the picked category has its own spares section: add a spare, five at most, no time, points or hint', …)` — розділ `getByRole('region', { name: 'Запасні категорії «Спорт»' })` (`<section aria-label>`), «Додати запасне» → `onChange` з `categories[0].spares` довжини 1 типу `single`; на 5 запасних кнопка вимкнена; полів «Час, с», «Бали», «Підказка» в розділі немає; типів у розділі 5.
    2. `it('picking a cell of another category shows that category's spares', …)` — клік по клітинці «Міста» → розділ «Запасні категорії «Міста»».
    3. `it('warns about a category without spares when swap is on; explains the legacy board', …)` — `swapOn` і `legacySpares={false}`, у Міст запасних немає → текст `categorySparesNone`; `swapOn` без запасних категорій і `legacySpares` → `categorySparesLegacy`; `swapOn={false}` → жодного з двох.
    4. `it('a column with spares shows the badge', …)` — у Спорту 2 запасні → `getByLabelText('Запасних: 2')`.
  - `PowersEditor.test.tsx`: `it('swap warns about categories without spares and a classic round without the pool, but not «add spares» when categories have them', …)` — `gaps={{ anyCategory: true, emptyCategories: ['Поле · Річки'], classicWithoutPool: true, legacyBoard: false }}`, `settings.buffs: ['swap']`, `spares={undefined}` → є тексти `powersSwapCategoriesEmpty` (з «Поле · Річки») і `powersSwapClassicEmpty`, немає `powersSwapNeedsSpares`.
  - Тест чернетки: збережена в `localStorage` чернетка з категорійним запасним, у якого `timeLimit: null` (так JSON зберігає NaN), відновлюється з `spares[0].timeLimit` = `NaN` і з тим самим текстом; не масив у `spares` → ключ зникає.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/editor`. Очікується FAIL: немає `swapGaps`, розділу запасних категорії, нових текстів; `problemSparesEmpty` блокує вікторину з запасними лише в категоріях.

- [ ] **Step 3: Implement.**
  - `BoardEditor`: під `<section className="panel board-panel">` — `<section className="panel category-spares" aria-label={t('categorySparesTitle', { title })}>` з `<h3>` того самого тексту, `SparesEditor` з `key={categories[category].id}`, `spares={categories[category].spares}`, `max={LIMITS.maxCategorySpares}`, `hint={t('categorySparesHint')}`, `onChange={(spares) => setCategory(category, …)}` (undefined — прибрати ключ `spares`, не писати `spares: undefined`). Під підказкою: `swapOn && legacySpares` → `<p className="meta">{t('categorySparesLegacy')}</p>`; `swapOn && !legacySpares && !(spares?.length)` → `<p className="meta powers-warn">{t('categorySparesNone')}</p>`. Значок у стовпці під назвою: `<span className="board-edit-spares" aria-label={t('categorySparesBadge', { count })}>⇄ {count}</span>`.
  - `QuizEditor`: `const gaps = swapGaps(quiz)`; `PowersEditor … gaps={gaps}`; `BoardEditor … swapOn={settings.buffs?.includes('swap') ?? false} legacySpares={gaps.legacyBoard}`.
  - `styles.css`: `.category-spares` — той самий вигляд, що `.board-panel` (відступ зверху 1rem); `.board-edit-spares` — дрібний `meta`-текст по центру стовпця. Перевірити 375 px: розділ без горизонтальної прокрутки (чіпи переносяться — `.type-chips` уже `flex-wrap`).

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS, включно з наявними тестами запасних у `QuizEditor.test.tsx` (`all eight buffs can be chosen…` — без запасних ніде `powersSwapNeedsSpares` і `problemSparesEmpty` лишаються).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/editor apps/web/src/i18n.ts apps/web/src/styles.css
git commit -m "feat(web): spares of a board category in the editor (up to 5, simple types), a ⇄ badge per column, warnings for categories without spares and classic rounds without the pool, the legacy-board note; drafts keep category spares"
```

---

### Задача 5. Веб: причина на телефоні, довідка й підказка «Заміни запитання»

**Files:**
- Modify: `apps/web/src/i18n.ts` (`buffWhere_swap`, `buffTip_swap`)
- Modify: `apps/web/src/screens/Buffs.test.tsx`

**Interfaces:**
- i18n (змінити):
  ```ts
  buffTip_swap: 'інше запитання із запасних (на полі — з тієї ж категорії), щонайменше 20 секунд',
  buffWhere_swap: 'Де: класика й поле у свій хід. На полі — запасне з тієї ж категорії.',
  ```
  `buffWhy_no_category_spares` уже є з задачі 1.

- [ ] **Step 1: Write the failing test** у `Buffs.test.tsx` поруч із наявним `spares_out`:
  ```ts
  it('swap on a cell of a category without spares explains why', () => {
    expect(whyOf(blockedOf('swap', 'no_category_spares'), 'Заміна запитання')).toBe('У цій категорії немає запасних запитань.');
  });
  it('the swap help names the category', () => {
    // відкрити довідку бафів так само, як наявний тест buffWhere_*, і перевірити рядок «Заміна запитання»
    expect(t('buffWhere_swap')).toContain('з тієї ж категорії');
  });
  ```
  Перший тест може пройти одразу (текст додано в задачі 1) — тоді лишити його як закріплення; другий падає до зміни тексту.

- [ ] **Step 2: Run** `pnpm vitest run --maxWorkers=2 apps/web/src/screens/Buffs.test.tsx`. Очікується FAIL на довідці.

- [ ] **Step 3: Implement** за Interfaces. `grep -rn "Де: класика й поле у свій хід\|інше запитання із запасних" apps packages` — буквальні старі рядки в тестах і e2e замінити на нові.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2 apps/web`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/i18n.ts apps/web/src/screens
git commit -m "feat(web): «У цій категорії немає запасних запитань.» on the swap button; the swap help and tip say a board cell takes a spare of the same category"
```

---

### Задача 6. Наскрізні: заміна на полі бере запасне тієї ж категорії, порожня категорія пояснює, чому ні

**Files:**
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе з задач 1–5.
- Наявні помічники: `open`, `register`, `join`, `shot`, `click`, `field`, `afterSplash`, `takeBuff`, `tapBuff`, `pickOption`, `numericAnswer`, `expectNoSideScroll`, `snapshot`, `exact`; фікстури `classicRound`, `boardRound`, `makeRoundsQuiz`, `withId`, `withPoints`, `single`.

- [ ] **Step 1: Add the scenario** `it('part 9d: spares of a board category — the editor adds a spare to a category and warns about an empty one, swap on a board cell takes a spare of the same category, an empty category explains why swap is off, a classic round keeps the global pool, category spares in the history', …)` з `try/catch` і `snapshot()`. Підготовка:
  1. Ведучий `register(host, 'host', 'Олег Ведучий', 'host9d@example.com')`. Вікторина «Запасні 9d» через `host.request.post(…/api/quizzes)`: `buffs: ['swap']`, `leaderboard: 'end'`;
     - класичний раунд «Розминка» `speedBonus: false`: одне запитання single «Розминка: столиця України?» — «Київ» (правильний), «Львів», «Одеса», 30 с, 100 балів;
     - поле «Поле» (`answerMode: 'phone'`, `check: 'auto'`): категорії «Спорт», «Міста», «Річки», клітинки 100/200/300 «{категорія} {ціна}: столиця України?» (як `cellQ` у сценарії 8b); у «Спорт» `spares`: `sp1` boolean «Футбольний м’яч — круглий?» (Так), `sp2` numeric «Скільки гравців у волейбольній команді на майданчику?» (6); у «Міста» й «Річки» запасних немає;
     - загальний пул `spares`: `g1` text «Яке місто стоїть на Пруті?» (`accepted: ['Чернівці']`).
  2. **Редактор** (1280 × 900). «Редагувати» → «Бафи й дебафи»: видно «Заміна запитання: немає запасних у категоріях: Поле · Міста, Поле · Річки — на їхніх клітинках заміни не буде.»; немає «Заміна запитання: додайте запасні запитання». Раунд «Поле» у стрічці раундів → клітинка «Міста, 100»: розділ «Запасні категорії «Міста»» з рядком «Немає запасних: на клітинках цієї категорії заміна буде недоступна.»; кадр `spares9d-editor-empty`. У розділі «Додати запасне» → «так чи ні» → текст «Львів — обласний центр?» → «Правильна відповідь: Так»; у стовпці «Міста» — значок «⇄ 1»; попередження тепер лише «Поле · Річки»; кадр `spares9d-editor-category`. `host.setViewportSize({ width: 375, height: 812 })` → кадр `spares9d-editor-category-375`, `expectNoSideScroll(host, 'spares9d-editor-375')`; назад 1280 × 900; «Зберегти» — збереження успішне (попередження не блокують).
  3. Гра: `stage` 1600 × 900, `olya`, `petro`, `ira` — 375 × 812, приєднуються в цьому порядку (черга поля: Оля → Петро → Іра). «Почати гру» → `afterSplash`.

- [ ] **Step 2: Assertions and shots** (у такому порядку):
  1. **Класика — загальний пул.** Іра: `takeBuff(ira, 'Заміна запитання')` → `h1` «Яке місто стоїть на Пруті?»; `field(ira, 'Ваша відповідь')` «Чернівці» → «Відповісти» → «Відповідь прийнято». Оля й Петро відповідають «Київ». Ведучий доводить до поля (як `toBoard` у 8b).
  2. **Спорт — запасне Спорту.** Оля «Ваш хід» → «Спорт, 100» → `takeBuff(olya, 'Заміна запитання')` → на сцені й усіх телефонах `h1` «Футбольний м’яч — круглий?» (не «Яке місто стоїть на Пруті?»); сцена — «⇄ Оля: запасне запитання»; кадри `spares9d-board-swap-375` (Оля), `spares9d-board-swap-stage`; `expectNoSideScroll(olya, 'spares9d-board-swap-375')`. Оля «Так» → ведучий «Прийняти» → «Правильно!».
  3. **Річки — немає запасних.** Петро «Річки, 100» → `tapBuff(petro, 'Заміна запитання', 'У цій категорії немає запасних запитань.')`; кнопка має `aria-disabled="true"`; кадр `spares9d-swap-off-375`, `expectNoSideScroll(petro, 'spares9d-swap-off-375')`. Відкрити довідку бафів (наявна кнопка «?» на телефоні, як у сценарії 8a/9a) — рядок «Де: класика й поле у свій хід. На полі — запасне з тієї ж категорії.»; кадр `spares9d-help-375`; закрити. `pickOption(petro, 'Київ')` → «Прийняти».
  4. **Іра** «Міста, 100» → `tapBuff(ira, 'Заміна запитання', 'Уже використано.')` → «Київ» → «Прийняти». **Оля** «Спорт, 200» → «Київ» → «Прийняти».
  5. **Міста — запасне з редактора.** Петро «Міста, 200» → `takeBuff(petro, 'Заміна запитання')` → усі бачать `h1` «Львів — обласний центр?» (не «Скільки гравців…» зі Спорту, не загальне); кадр `spares9d-board-swap-cities-375`. Петро «Так» → «Прийняти» → «Правильно!».
  6. **Історія.** «Завершити гру» → подіум. Історія ведучого, гра «Запасні 9d»: «Запасне: Яке місто стоїть на Пруті?» (Іра), «Запасне: Футбольний м’яч — круглий?» (Оля), «Запасне: Львів — обласний центр?» (Петро); кадр `spares9d-history`.
  7. `expect(problems).toEqual([])`.

- [ ] **Step 3: Run** `pnpm build`, потім `npx vitest run --config apps/server/e2e/vitest.config.ts`. Очікується PASS усіх сценаріїв (8b не змінюється: його вікторина без запасних категорій, поле бере загальний пул). Потім той самий запуск з `E2E_SHOTS=1` і перегляд кадрів у `apps/server/e2e/artifacts/shots`: розділ запасних категорії на 375 px читається, чіпи переносяться; пояснення «У цій категорії немає запасних запитань.» видно повністю в рядку пояснень і не накриває варіантів; запасне Спорту на сцені й телефоні.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm vitest run --maxWorkers=2`. Очікується PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/e2e/full-game.e2e.ts
git commit -m "test: part 9d end-to-end — the editor adds a spare to a category and warns about empty ones, swap on a board cell takes a spare of the same category, an empty category says why swap is off, classic keeps the global pool, category spares in the history"
```

Після фінальної рецензії гілку злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. У звіті власникові назвати рішення: кожна категорія поля може мати до 5 власних запасних (прості типи, без відео); заміна на клітинці бере наступне запасне саме цієї категорії, а в категорії без запасних кнопка неактивна з поясненням «У цій категорії немає запасних запитань.»; класика, як і раніше, бере загальні запасні; **старі вікторини (і «Мозаїка» в акаунті) працюють, як раніше: поки жодна категорія не має власних запасних, поле бере загальні — щоб «Мозаїка» давала запитання з тієї ж категорії, треба додати запасні її категоріям у редакторі**; щойно хоч одна категорія має запасні, кожна клітинка бере лише зі своєї категорії, без підміни загальними; редактор не вимагає запасних у кожній категорії, лише попереджає; демо «Від шкільної парти до мемів» має по 2 запасні в кожній категорії; формат стану не змінився — пуш 9d ігор, що йдуть, не перериває.
