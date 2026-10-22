# План 6e: запитання з відео YouTube

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Мета:** будь-яке запитання може мати відео з YouTube. Автор вставляє посилання в редакторі й одразу бачить плеєр. У грі плеєр є на телефонах, пульті й сцені, сам ніде не вмикається. Запитання з відео не має таймера: воно закривається, коли відповіли всі, хто може відповідати, або коли ведучий натискає «Закрити запитання». Якщо відео недоступне, замість плеєра видно напис «Відео недоступне», і гра йде далі.

**Архітектура:**
- **Схема.** Кожне запитання отримує поле `video: { id, start } | null`, типово `null`, тож старі вікторини й старі знімки в історії читаються без змін. Посилання розбирає чиста функція `parseYouTubeLink` у `packages/shared/src/youtube.ts`. Зберігаються лише 11-символьний ідентифікатор і секунда початку, довільна адреса не зберігається ніколи.
- **Таймера немає.** Є запитання таймер, визначає одна функція: `isTimed(question)`, тобто `question.video === null`. Поле `timeLimit` лишається в схемі й зберігається (у редакторі приховане). Якщо автор прибере відео, повернеться попередній час.
  - `limitMsOf(play)` повертає `null` для запитання без таймера.
  - `openQuestion` ставить `endsAt: null`, а `startedAt` ставить, як завжди: від нього рахується час відповіді.
  - Етап `question` без паузи з `endsAt === null` трапляється лише для запитання без таймера, але перевірки часу дивляться на `isTimed`, а не на це збігання. Їх зібрано в `timeOver` (`timing.ts`).
- **Закриття** не потребує нового коду: `autoLock` уже закриває класичне запитання, коли відповіли всі підключені. Для поля закриває відповідь або оцінка ведучого, для черги (бліц-раунд, бліц-клітинка) `blitzDone`: першою правильною відповіддю (без `endsAt` гілка «час сплив» не спрацьовує). «Закрити запитання» — наявний `host:lock`.
- **Відсутність на звичайній клітинці без таймера.** Без таймера клітинка відкрита, поки не відповість гравець, чий хід. Тому діє наявний відлік `board.awaySince` (30 с, `BOARD_AWAY_MS`), але на етапі `question`: коли час сплив, `tick` закриває запитання (`lockNow`), як це зробив би кінець таймера. Далі «Показати відповідь» дає «неправильно» через наявний `unansweredIsWrong`.
- **Плеєр.** Один компонент `YouTubePlayer` в `apps/web/src/screens/YouTubePlayer.tsx` для редактора, телефона, пульта й сцени: `<iframe>` на `https://www.youtube-nocookie.com/embed/<id>?start=…` без `autoplay`. Сценарій `iframe_api` з мережі не вантажиться. Недоступне відео визначається так:
  - повідомлення `onError` від самого вбудованого плеєра (`enablejsapi=1` і `postMessage`, перевіряються джерело й origin);
  - `navigator.onLine === false` у мить показу.

  Тому наскрізні тести працюють без мережі: Playwright підміняє сторінки `youtube-nocookie.com` заглушкою, і та сама заглушка вміє надіслати `onError`.
- **CSP.** Сервер не ставить політики безпеки на сторінки (`content-security-policy: default-src 'none'` є лише на `/uploads/*`, і це правильно), тому iframe нічого не блокує. План додає тест, який зафіксує це: якщо колись з'явиться CSP сторінок, тест нагадає дозволити `frame-src https://www.youtube-nocookie.com`.

**Технології:** TypeScript, zod 4, vitest, Fastify + Socket.IO, Drizzle (PGlite у тестах), React + Vite, Playwright.

**Специфікація:** `docs/superpowers/specs/2026-10-21-after-first-game-design.md`, частина E (розділ 7), а також розділи 2 (анти-цілі), 10 (`video: {id, start} | null`, CSP) і 11 (тестування) у тій мірі, в якій вони стосуються E. «Прийняти» / «Перевибрати» для запитання без таймера описує розділ 4 (останній абзац); утримання реалізоване в плані 6a, бліц-клітинки — у плані 6c.

**Рішення плану там, де специфікація мовчить:**
- **`timeLimit` лишається.** Поле часу запитання з відео приховане, але значення зберігається. Кнопка «Однаковий час для всіх запитань раунду» запитання з відео пропускає. Отже, якщо прибрати відео, повернеться час, який був до нього.
- **Бліц без вікна й без таймера.** `answerWindow: null` у бліц-раунді означає «до кінця таймера запитання». Для запитання без таймера це стає вікном `DEFAULT_ANSWER_WINDOW` (15 с). Інакше гравець, що натиснув і мовчить, тримав би чергу без кінця, і вихід був би лише в закритті всього запитання. Бліц-клітинка з телефона вже має це вікно. Усна бліц-клітинка вікна не має, як і раніше: голову оцінює ведучий.
- **Відсутність на звичайній клітинці** (див. архітектуру). Відлік зупиняється, поки відповідь помаранчева (рішення за ведучим) і на паузі. Після паузи гравець знову має повні 30 с, як на етапі вибору. `lockNow` скидає `awaySince`.
- **Рівний рахунок.** Сумарний час для рівного рахунку (`totalTimeMs`, лише класичні раунди) не враховує запитань без таймера ні з відповіддю, ні без неї. Без таймера немає «повного часу» для тих, хто не відповів.
- **Бонус за швидкість** для запитання без таймера завжди 1, навіть з `speedBonus: true`, і при `override` на розкритті теж.
- **Пауза без таймера.** `startedAt` під час паузи не скидається. Після продовження `startedAt` і вікна черги зсуваються на тривалість паузи, як у запитанні з таймером.
- **`PublicQuestion`** отримує `video` і `timeLimit: number | null` (`null` без таймера). Правильної відповіді там, як і раніше, немає.
- **Неправильне посилання** показує помилку під полем, а запитання лишається без відео (`video: null`), доки посилання не виправлять. Попередній перегляд при цьому зникає, і це видно одразу. Чернетка не зберігає сирого тексту поля.
- **Які посилання приймаються:**
  - хости `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be`, `youtube-nocookie.com`, `www.youtube-nocookie.com`, зі схемою `http(s)://` або без неї;
  - шляхи `/watch?v=ID`, `youtu.be/ID`, `/shorts/ID`, `/embed/ID`;
  - час `t` або `start`: ціле число секунд (`90`, `90s`) або `1h2m3s` / `1m30s` / `2m`.

  Неправильна позначка часу робить усе посилання неправильним. Інші параметри (`list`, `index`, `si`, `feature`) ігноруються. Верхня межа початку `LIMITS.maxVideoStart = 43_200` (12 год).
- **Відновлення після перезапуску сервера.** Кімнати живуть у пам'яті, гра після перезапуску не відновлюється, тож окремої роботи немає. «Продовжити» стосується паузи, і пауза покрита задачею 2.
- **Історія гри** відео не показує (YAGNI). Старі знімки отримують `video: null` за схемою.
- **Демо.** У `apps/server/scripts/demo-quiz.ts` одне запитання з відео є в класичному раунді й одне в бліц-раунді, у `party-quiz.ts` одне звичайною клітинкою поля. Використано офіційні кліпи, які давно дозволяють вбудовування: `dQw4w9WgXcQ` (Rick Astley — Never Gonna Give You Up) і `fJ9rUzIMcZQ` (Queen — Bohemian Rhapsody). `apps/web/src/demo-quiz.ts` (розминка без входу) не змінюється.

## Глобальні обмеження

- Стара вікторина без поля `video` відкривається, грається й показується в історії так само, як раніше. Запитання без відео поводиться точно як зараз: таймер, «±15 с», бонус за швидкість.
- Рушій чистий: без мережі, бази й таймерів. `now` і `rng` передаються аргументами.
- Значення (точно зі специфікації):
  - відео ніде не вмикається автоматично (`autoplay` відсутній в адресі);
  - запитання з відео без таймера, поле часу в редакторі для нього приховане;
  - бонусу за швидкість немає, кнопки «±15 с» не показуються;
  - закривається, коли відповіли всі підключені гравці, які можуть відповідати, або ведучим;
  - звичайна клітинка: відповідає один гравець, 30 с на повернення;
  - бліц-раунд і бліц-клітинка: перша правильна відповідь або ведучий, вікно відповіді діє як зазвичай;
  - запитання може мати і картинку, і відео;
  - напис для недоступного відео: «Відео недоступне».
- Зберігається лише `{ id, start }`. Плеєр будує адресу сам і лише на `https://www.youtube-nocookie.com/embed/`.
- Захист від спойлерів не змінюється: `video` не містить нічого про правильну відповідь.
- Тексти інтерфейсу українською, лише через `apps/web/src/i18n.ts`; кольори лише через наявні токени `styles.css`.
- Кожна задача починається з тесту, що падає. Перед комітом зелені `pnpm vitest run --maxWorkers=2` і `pnpm typecheck`. Саме `--maxWorkers=2`, а не `pnpm test`: паралельні робітники PGlite падають під навантаженням на цій машині.
- Наскрізні тести не ходять у мережу до YouTube: усі запити до `youtube-nocookie.com`, `youtube.com`, `youtu.be` і `ytimg.com` підміняються в Playwright.
- Після останньої задачі й фінальної рецензії гілку зливають у `main` і пушать (побажання власника: проєкт тестовий). Міграцій немає.

## Порядок збирання

- Задача 1 робить `video` обов'язковим у вихідному типі `Question` (`.nullable().default(null)`). У тій самій задачі механічно оновлюються всі місця, що будують запитання в коді:
  - `base` у `packages/engine/src/testing/fixtures.ts`;
  - `q` у `apps/server/scripts/demo-quiz.ts`, `base` в `apps/web/src/demo-quiz.ts`;
  - `newQuestion` і тип `Common` в `apps/web/src/editor/draft.ts`;
  - тести, що будують `Question` літералом із `satisfies Question` або з типом `Question`: додати `video: null`.
- Задача 2 додає `PublicQuestion.video` і робить `timeLimit: number | null`. Вона ж механічно додає `video: null` у фабрики `PublicQuestion` у `apps/web/src/screens/*.test.tsx` і `apps/web/src/pages/*.test.tsx`, щоб `apps/web` компілювався.
- Наскрізні сценарії (`pnpm e2e`) не входять у `vitest run`. Наявні сценарії мають лишатися зеленими після кожної задачі, бо запитання без відео не змінюється.

## На що дивитися рецензентові

1. **Класичне запитання з відео, а гравець, що не відповів, відключився.** Запитання закривається, щойно відповіли всі підключені, а не висить. Якщо відключилися всі, воно чекає на ведучого й не закривається само. Тест: задача 2, `an untimed question closes when the last unanswered player drops, and waits with nobody connected`.
2. **Бліц з відео й вікном відповіді, а ведучий ставить паузу.** Вікно голови черги після продовження зсувається на тривалість паузи, а не згоряє на паузі. Тест: задача 2, `pause on an untimed blitz question shifts the answer windows`.
3. **Звичайна клітинка з відео, гравець, чий хід, відключився.** Через 30 с запитання закривається. Якщо він повернувся раніше, відлік скидається. Якщо його відповідь помаранчева, клітинка чекає на ведучого й не закривається. Тест: задача 3, `an untimed normal cell closes 30 s after its answerer left, unless they return or their answer waits`.
4. **Посилання в незвичній формі:**
   - з `&list=…&index=2`, `m.youtube.com`, без `https://`, `t=1h2m3s` мають розбиратися;
   - мають відмовляти: `youtube.com.evil.com`, ідентифікатор не з 11 символів, `t=abc`, посилання на канал чи плейлист без відео.

   Тест: задача 1, `parseYouTubeLink`.
5. **Бліц-раунд з `answerWindow: null` і відео, а той, хто натиснув першим, мовчить.** Через 15 с черга йде до наступного (вікно `DEFAULT_ANSWER_WINDOW`), тож гра не стоїть. Тест: задача 2, `a blitz round without a window gives a silent head the default window on an untimed question`.

---

### Задача 1. Схема: поле `video` і розбір посилань YouTube

**Files:**
- Create: `packages/shared/src/youtube.ts`, `packages/shared/src/youtube.test.ts`
- Modify: `packages/shared/src/quiz.ts`, `packages/shared/src/index.ts` (`export * from './youtube'`)
- Modify (механічно, лише щоб компілювалося): `packages/engine/src/testing/fixtures.ts`, `apps/server/scripts/demo-quiz.ts` (`q`), `apps/web/src/demo-quiz.ts` (`base`), `apps/web/src/editor/draft.ts` (`Common`, `newQuestion`), тести, що будують `Question` літералом
- Test: `packages/shared/src/quiz.test.ts`, `packages/shared/src/youtube.test.ts`

**Interfaces:**
- Produces (shared, `quiz.ts`):
  ```ts
  // LIMITS доповнюється:
  maxVideoStart: 43_200,
  /** Ідентифікатор відео YouTube. */
  export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
  export const videoSchema = z.object({
    id: z.string().regex(YOUTUBE_ID),
    /** Секунда, з якої починається відтворення. */
    start: z.number().int().min(0).max(LIMITS.maxVideoStart),
  });
  export type Video = z.infer<typeof videoSchema>;
  // base запитання:
  /** Відео з YouTube; є відео — немає таймера запитання. Старі вікторини: null. */
  video: videoSchema.nullable().default(null),
  ```
- Produces (shared, `youtube.ts`):
  ```ts
  /** Розбирає посилання YouTube (watch, youtu.be, shorts, embed; t= або start= у секундах чи 1h2m3s); null — не посилання на відео. */
  export function parseYouTubeLink(link: string): Video | null;
  /** Коротке посилання для поля редактора: https://youtu.be/<id> і ?t=<start>, якщо start > 0. */
  export function videoLink(video: Video): string;
  ```
  Розбір іде через `new URL(...)`; рядок без схеми спершу отримує префікс `https://`. Хост порівнюється з переліком точно, а не через `includes`/`endsWith`. Результат проходить `videoSchema.safeParse`: так межі `id` і `start` перевіряються в одному місці.
- Produces (fixtures): `withVideo(question: Question, video: Video = { id: 'dQw4w9WgXcQ', start: 0 }): Question`; `base` отримує `video: null`.

- [ ] **Step 1: Write the failing tests**

```ts
// youtube.test.ts
describe('parseYouTubeLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2', 0],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 42],
    ['youtu.be/dQw4w9WgXcQ', 0],
    ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 90],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc&t=90s', 90],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=75', 75],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 0],
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s', 3723],
    ['  https://youtu.be/dQw4w9WgXcQ?t=2m  ', 120],
  ])('reads %s', (link, start) => {
    expect(parseYouTubeLink(link)).toEqual({ id: 'dQw4w9WgXcQ', start });
  });
  it.each([
    '',
    'не посилання',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=abc',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=99999',
    'https://www.youtube.com/@NASA',
    'https://www.youtube.com/playlist?list=PL123',
    'javascript:alert(1)',
  ])('refuses %s', (link) => {
    expect(parseYouTubeLink(link)).toBeNull();
  });
});
it('videoLink round-trips through parseYouTubeLink', () => {
  // videoLink({ id: 'dQw4w9WgXcQ', start: 0 }) === 'https://youtu.be/dQw4w9WgXcQ';
  // videoLink({ id: 'dQw4w9WgXcQ', start: 90 }) === 'https://youtu.be/dQw4w9WgXcQ?t=90';
  // parseYouTubeLink(videoLink(v)) дорівнює v для обох
});
// quiz.test.ts
it('an old question without a video reads as video null', () => {
  // quizSchema.parse(quiz з single без поля video).rounds[0].questions[0].video === null; так само клітинка поля
});
it('a question may have both an image and a video', () => {
  // { ...single, imageUrl: '/uploads/<16 hex>.png', video: { id: 'dQw4w9WgXcQ', start: 30 } } → questionSchema ok
});
it('a video other than an id and a start is refused', () => {
  // video { id: 'bad', start: 0 } → fail; { id: 'dQw4w9WgXcQ', start: -1 } → fail; { id: 'dQw4w9WgXcQ', start: 1.5 } → fail;
  // { url: 'https://evil.example' } → fail
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/shared`
Expected: FAIL (`parseYouTubeLink` не існує, `video` undefined).

- [ ] **Step 3: Implement** `videoSchema`, поле `video`, `youtube.ts`, `withVideo` і механічні правки місць, що будують запитання (`video: null`). `changeType` у `draft.ts` переносить `video`, бо `Common` тепер його містить.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; наявні тести зелені без змін очікувань.

- [ ] **Step 5: Commit**

```bash
git add packages apps
git commit -m "feat(shared): an optional YouTube video on every question, link parsing"
```

---

### Задача 2. Рушій: запитання без таймера в класичному раунді й бліці, зрізи

**Files:**
- Modify: `packages/engine/src/timing.ts`, `packages/engine/src/game.ts` (`openQuestion`, `submitAnswer`, `submitBoardAnswer`, `submitBlitzAnswer`, `withTotals`, `unansweredIsWrong`, `pause`, `resume`, `overrideBoard`, `override`), `packages/engine/src/blitz.ts` (`blitzRulesOf`, `buzz`, `nextDeadline`), `packages/engine/src/views.ts` (`publicQuestion`)
- Modify: `packages/shared/src/views.ts` (`PublicQuestion`)
- Modify (механічно): фабрики `PublicQuestion` у `apps/web/src/screens/*.test.tsx`, `apps/web/src/pages/*.test.tsx` (`video: null`)
- Create: `packages/engine/src/game.video.test.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `Video`, `withVideo` (задача 1).
- Produces (engine, `timing.ts`):
  ```ts
  /** Чи має запитання таймер: запитання з відео його не має. */
  export function isTimed(question: Question): boolean;
  /** Повний час запитання з урахуванням змін ведучого; null — без таймера. */
  export function limitMsOf(play: Play): number | null;
  /** Чи сплив час запитання на мить clock: без startedAt — так; без таймера — ніколи; інакше clock > endsAt (endsAt null — так). */
  export function timeOver(state: GameState, play: Play, clock: number): boolean;
  ```
- Produces (shared, `views.ts`):
  ```ts
  interface PublicQuestion {
    /* … */
    /** null — запитання без таймера (з відео). */
    timeLimit: number | null;
    video: Video | null;
  }
  ```

**Правила:**
- **`openQuestion`:** `endsAt: isTimed(question) ? now + question.timeLimit * 1000 : null`.
- **Перевірки часу:**
  - `submitAnswer` (класичний), `submitBoardAnswer` і `buzz` замість `state.startedAt === null || state.endsAt === null || now > state.endsAt` викликають `timeOver(state, play, clock)`;
  - `submitBlitzAnswer` бере межу `entry.deadline ?? (isTimed(play.question) ? state.endsAt : Infinity)`.
  - `settle` і `blitzDone` не змінюються: без `endsAt` голова без вікна просто чекає, а гілка «час сплив» не спрацьовує.
- **`blitzRulesOf`** для бліц-раунду: `answerWindow: round.answerWindow ?? (isTimed(play.question) ? null : DEFAULT_ANSWER_WINDOW)`. `cellBlitzRules` не змінюється.
- **Бали й час:**
  - `speedFactor(timeMs, limit ?? 0, bonus && limit !== null)` у `submitAnswer` і `override`, де `limit = limitMsOf(play)`;
  - у `withTotals` запитання з `limitMsOf(play) === null` пропускається в `totalTimeMs` повністю;
  - `unansweredIsWrong` і `overrideBoard` беруть `limitMsOf(play) ?? 0` там, де зараз беруть повний час.
- **Пауза:** `pause` для запитання без таймера (і без утримання) іде гілкою «інші етапи», тобто `startedAt` лишається. `resume` отримує гілку для `phase === 'question' && !isTimed(play.question)` без утримання:
  - `shift = now − pausedAt`;
  - `startedAt + shift`;
  - `shiftQueue(…, shift)`;
  - потім `autoLock(settleQueue(…, now))`.

  Гілка з утриманням (`heldAt !== null`) лишається першою й без змін.
- **`nextDeadline`:** умову `state.endsAt === null` прибрано з раннього виходу. Часи — це `endsAt` (якщо є) і вікна черги; `null` відкидаються, як зараз. Відлік відсутності на етапі `question` додає задача 3.
- **`adjustTime`** не змінюється: `remainingOf` для запитання без таймера дає `null`, тож відповідь `wrong_phase` (тест це закріплює).
- **`publicQuestion`:** `timeLimit: isTimed(question) ? question.timeLimit : null`, `video: question.video`.

- [ ] **Step 1: Write the failing tests** у `game.video.test.ts` (гравці Анна p1, Богдан p2; `const clip = withVideo(single)`; відкриття в момент 0):

```ts
describe('a classic question with a video', () => {
  it('has no timer and takes answers long after its time limit', () => {
    // classicRound з [clip] → state.endsAt === null, startedAt 0; submitAnswer(p1, b, 600_000) ok; tick(10_000_000) → phase 'question'
  });
  it('closes when every connected player has answered', () => {
    // p1 b у 5000 → question; p2 a у 9000 → locked
  });
  it('the host closes it at any time', () => {
    // lock(state) → locked; next → reveal; p1 і p2 без записів
  });
  it('an untimed question closes when the last unanswered player drops, and waits with nobody connected', () => {
    // p1 відповідає; setConnected(p2, false) → locked.
    // Окрема гра: setConnected(p1, false), setConnected(p2, false) → question; tick(1e9) → question
  });
  it('gives no speed bonus even with the speed bonus on', () => {
    // speedBonus true, points 1000: p1 b у 100_000 → reveal: p1 1000; override(p1, 'correct') на reveal → 1000
  });
  it('refuses ±15 s', () => {
    // adjustTime(state, 15, 1000) і adjustTime(state, -15, 1000) → { ok: false, error: 'wrong_phase' }
  });
  it('pause and resume keep it open and do not count the pause into answer time', () => {
    // pause у 10_000, resume у 70_000 → startedAt 60_000, endsAt null; p1 b у 80_000 → record.timeMs 20_000
  });
  it('leaves the tie-break time out', () => {
    // [clip, single] : clip — p1 у 50_000, p2 без відповіді, lock; single — обидва у 3000 → players[*].totalTimeMs 3000
  });
  it('schedules no deadline', () => {
    // nextDeadline(state, 0) === null
  });
});
describe('a blitz question with a video', () => {
  it('takes a buzz at any time and closes on the first correct answer', () => {
    // blitzRound answerWindow 10: buzz p1 у 300_000 → deadline 310_000; answer b, accept → locked
  });
  it('the answer window still applies and nextDeadline sees it', () => {
    // buzz p1 у 1000 → nextDeadline(state, 1000) === 11_000; tick(11_000) → attempts [p1 wrong], queue [], phase question
  });
  it('a blitz round without a window gives a silent head the default window on an untimed question', () => {
    // answerWindow null: buzz p1 у 1000 → deadline 16_000; buzz p2; tick(16_000) → голова p2.
    // Той самий раунд з single (без відео): buzz p1 → deadline null (як і раніше)
  });
  it('a wrong answer does not close it, the host does', () => {
    // attempts null: p1 buzz, a, accept → question; lock → locked, усі 0
  });
  it('pause on an untimed blitz question shifts the answer windows', () => {
    // answerWindow 10: buzz p1 у 1000 (deadline 11_000); pause у 5000; resume у 65_000 → deadline 71_000; tick(70_000) → p1 ще голова
  });
});
// views.test.ts
it('players see the video and no timer on a video question, never the correct answer', () => {
  // classicRound([withVideo(single, { id: 'dQw4w9WgXcQ', start: 90 })]):
  // stageView.question → { video: { id: 'dQw4w9WgXcQ', start: 90 }, timeLimit: null }; endsAt null, remainingMs null;
  // playerView(p1).question.video те саме; JSON.stringify(stageView) не містить 'correctId'
});
it('a question without a video keeps its time limit and video null', () => {
  // single → question.timeLimit 20, video null, endsAt 20_000
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/engine`
Expected: FAIL (`endsAt` 20000, `time_over` після часу запитання).

- [ ] **Step 3: Implement** `isTimed`, `limitMsOf`, `timeOver`, правки `game.ts`, `blitz.ts`, `views.ts` за правилами вище, `PublicQuestion` і механічні `video: null` у фабриках `apps/web`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; `game.timing.test.ts`, `game.blitz.test.ts` і `game.flow.test.ts` зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web
git commit -m "feat(engine): a video question has no timer, closes on answers or by the host"
```

---

### Задача 3. Рушій: відео на полі, звичайна клітинка, бліц-клітинка й відсутність

**Files:**
- Modify: `packages/engine/src/game.ts` (`setConnected`, `tick`, `lockNow`), `packages/engine/src/blitz.ts` (`nextDeadline`)
- Test: `packages/engine/src/game.video.test.ts`, `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `isTimed`, `timeOver` (задача 2); `BOARD_AWAY_MS`, `clearAway` (наявні).
- Produces (engine, `game.ts`, не експортується):
  ```ts
  /** Гравець, чия відсутність закриває запитання: той, хто вибрав звичайну клітинку без таймера; інакше null. */
  function awayWatched(state: GameState): string | null;
  ```

**Правила:**
- **`setConnected`:** на етапі `question` без паузи, коли `awayWatched(state) === playerId`, ставить `board.awaySince` (`connected ? null : (awaySince ?? now)`), як на етапі `board`, і далі `autoLock`.
- **`tick` на етапі `question`:**
  - після `releaseStaleHold` і виходу при `heldAt !== null` (помаранчева відповідь не закривається відсутністю), для `awayWatched(state) !== null`:
    - відсутній, а `awaySince === null` → поставити `awaySince = now`;
    - `now >= awaySince + BOARD_AWAY_MS` → `lockNow`;
  - інакше без змін.
- **`lockNow`** скидає відлік: `board: clearAway(state.board)`.
- **`pause`** уже скидає `awaySince` (`clearAway` у гілці «інші етапи»), а `tick` після продовження ставить його заново. Отже, після паузи гравець має повні 30 с.
- **`nextDeadline` на етапі `question`** додає `awaySince + BOARD_AWAY_MS`, коли `awaySince !== null`, без паузи й без утримання.
- **Звичайна клітинка з телефона** без таймера: відповідь ставить утримання й чекає «Прийняти» / «Перевибрати», як зараз. `submitBoardAnswer` уже використовує `timeOver` (задача 2).
- **Усна звичайна клітинка** без таймера: відкрита, поки ведучий не оцінить (`host:override`) або не закриє.
- **Бліц-клітинка** без таймера: закривається першою правильною відповіддю або «Закрити клітинку». Вікно з телефона 15 с діє. «Мінус для всіх» нараховується в `lockNow`, як зараз.
- **`boardInfo.skipAt`** рахується з `awaySince` і на етапі `question`, тож пульт може показати відлік (задача 5).

- [ ] **Step 1: Write the failing tests** у `game.video.test.ts`, `describe('a video on the board')`. Поле як у `game.board-cells.test.ts`, `c11` — `withVideo(single)` за 100; p1 вибирає `c11` у 0.

```ts
it('a normal phone cell with a video has no timer and waits for the answerer', () => {
  // endsAt null; tick(600_000) → question; submitAnswer(p1, b, 600_000) → heldAt 600_000; acceptAnswer → reveal, p1 100
});
it('repick on an untimed cell lets the answerer answer again', () => {
  // p1 a у 5000; repick у 9000 → heldAt null, endsAt null; p1 b → accept → p1 100
});
it('only the chooser answers an untimed normal cell', () => {
  // submitAnswer(p2, b) → not_your_turn
});
it('an untimed normal cell closes 30 s after its answerer left, unless they return or their answer waits', () => {
  // setConnected(p1, false, 1000) → board.awaySince 1000; nextDeadline(state, 1000) === 31_000; tick(30_999) → question;
  // tick(31_000) → locked, board.awaySince null; next → reveal: p1 grade 'wrong'.
  // Окремо: setConnected(p1, false, 1000), setConnected(p1, true, 20_000) → awaySince null; tick(60_000) → question.
  // Окремо: p1 a у 500 (утримання), setConnected(p1, false, 1000), tick(100_000) → question, pendingOf → p1.
  // Окремо: setConnected(p1, false, 1000), pause у 10_000, resume у 50_000, tick(50_000) → awaySince 50_000; tick(79_999) → question
});
it('a voice cell with a video stays open until the host grades it', () => {
  // c11 { answerMode: 'voice' } з відео: tick(600_000) → question; override(p1, 'correct', 600_000) → locked
});
it('an untimed blitz cell closes on the first correct answer or by the host, with penalty for all once', () => {
  // c11 { kind: 'blitz', penalty: 'all' } з відео: p2 buzz у 200_000 (deadline 215_000), b, accept → locked;
  // next → reveal: p2 100, p1 −100, p3 −100.
  // Окрема гра: lock без відповідей → усі −100
});
it('an absent player does not close an untimed blitz cell', () => {
  // c11 { kind: 'blitz' } з відео: setConnected(p1, false, 1000); tick(100_000) → question; board.awaySince null
});
// views.test.ts
it('the host sees when an absent answerer will close an untimed cell', () => {
  // setConnected(p1, false, 1000) на звичайній клітинці з відео → hostView.board.skipAt === 31_000, phase 'question'
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 packages/engine/src/game.video.test.ts`
Expected: FAIL (відсутність на етапі `question` не відстежується).

- [ ] **Step 3: Implement** `awayWatched`, правки `setConnected`, `tick`, `lockNow` і `nextDeadline` за правилами вище.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS; `game.board.test.ts` і `game.board-cells.test.ts` зелені без змін.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): video questions on the board, absence closes an untimed cell after 30 s"
```

---

### Задача 4. Сервер: кімната без таймера, політика сторінок, стара історія

**Files:**
- Test: `apps/server/src/rooms/manager.test.ts`, `apps/server/src/app.test.ts`, `apps/server/src/history.test.ts`
- Modify: лише якщо тест виявить розбіжність (очікується, що змін коду сервера немає: `reschedule` бере `nextDeadline`, а історія читає знімок через схему)

**Interfaces:**
- Consumes: `nextDeadline` (задачі 2–3), `withVideo` (fixtures), `FakeScheduler`.

- [ ] **Step 1: Write the tests**

```ts
// manager.test.ts
it('a video question sets no question timer and closes when both players answered', () => {
  // вікторина з одним класичним запитанням withVideo(single); старт; scheduler.advance(600_000) → room.state.phase 'question';
  // відповідь обох → phase 'locked'
});
it('an absent answerer closes an untimed board cell after 30 s through the room timer', () => {
  // поле, клітинка з відео; host pick; гравець, чий хід, відключається; scheduler.advance(29_999) → question; advance(1) → locked
});
// app.test.ts (buildApp з webRoot — тимчасова тека з index.html)
it('pages carry no security policy that would block the YouTube player', async () => {
  // GET /play/123456 → 200; headers['content-security-policy'] undefined.
  // Коментар у тесті: якщо CSP сторінок колись додадуть, вона мусить мати frame-src https://www.youtube-nocookie.com
});
// history.test.ts
it('a game with a video question shows in the history like any other', async () => {
  // гра з withVideo(single), відповідь, кінець → hostGame ok; знімок вікторини має video { id, start }; відповіді з timeMs
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm vitest run --maxWorkers=2 apps/server`
Expected: PASS одразу (поведінку забезпечили задачі 2–3). Якщо `app.test.ts` червоний через CSP, зняти або доповнити заголовок дозволом `frame-src https://www.youtube-nocookie.com` і пояснити це в описі коміту.

- [ ] **Step 3: Run unit tests and typecheck**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server
git commit -m "test(server): untimed video questions in the room, pages allow the YouTube player"
```

---

### Задача 5. Плеєр YouTube на телефонах, пульті й сцені

**Files:**
- Create: `apps/web/src/screens/YouTubePlayer.tsx`, `apps/web/src/screens/YouTubePlayer.test.tsx`
- Modify: `apps/web/src/screens/PlayerScreen.tsx`, `HostScreen.tsx` (`SkipNote`), `StageScreen.tsx`, `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/screens/PlayerScreen.test.tsx`, `HostScreen.test.tsx`, `StageScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicQuestion.video`, `PublicQuestion.timeLimit` (задача 2), `BoardInfo.skipAt` на етапі `question` (задача 3).
- Produces (web, `YouTubePlayer.tsx`):
  ```ts
  export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
  /** Адреса вбудовування: start, rel=0, playsinline=1, enablejsapi=1, origin; ніколи autoplay. */
  export function youtubeEmbedUrl(video: Video, origin: string): string;
  /** Плеєр відео до запитання; null без відео. Недоступне відео (onError від плеєра або немає мережі) → «Відео недоступне». */
  export function YouTubePlayer({ video }: { video: Video | null }): JSX.Element | null;
  ```

**Правила `YouTubePlayer`:**
- **Розмітка:**
  ```html
  <div class="question-video">
    <iframe src={youtubeEmbedUrl(video, location.origin)}
            title={t('videoTitle')}
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy">
  ```
  `key` — `${id}-${start}`: зміна зрізу не перезавантажує плеєр, і відео не зупиняється між `question`, `locked` і `reveal`.
- **Недоступне відео:**
  - на `onLoad` iframe компонент шле в `contentWindow` `JSON.stringify({ event: 'listening', id: 1, channel: 'widget' })` з origin `YOUTUBE_ORIGIN`;
  - слухає `message` на `window`: приймає лише `event.source === iframe.contentWindow && event.origin === YOUTUBE_ORIGIN`, розбирає `event.data` як JSON у `try`, і `data.event === 'onError'` означає недоступне;
  - `navigator.onLine === false` у мить показу теж означає недоступне.

  Недоступне відео показує `<p class="video-unavailable" role="status">{t('videoUnavailable')}</p>` замість iframe. Стан скидається, коли змінюється `video.id`.
- **Стиль `.question-video`:** `aspect-ratio: 16 / 9`, `width: 100%`, `max-width` як у `.question-image`, рамка й радіус з наявних токенів. На сцені ширше: `.stage .question-video { max-width: 960px }`.
- **Екрани:** `<YouTubePlayer video={question.video} />` одразу після `QuestionImage` у `PlayerScreen`, `HostScreen` і `StageScreen`, там само, де картинка. Таймер і «±15 с» зникають самі (`endsAt` і `remainingMs` — `null`), окремої умови не треба: тести це закріплюють.
- **`SkipNote`** показується й на етапі `question`, коли `board.skipAt !== null`, з ключем `answererAwayClose`: «{name} відключений, клітинка закриється через {seconds} с».
- Ключі `i18n.ts`:
  - `videoTitle`: «Відео до запитання»;
  - `videoUnavailable`: «Відео недоступне»;
  - `answererAwayClose`.

- [ ] **Step 1: Write the failing tests**

```ts
// YouTubePlayer.test.tsx
it('builds a no-cookie embed address with the start and without autoplay', () => {
  // youtubeEmbedUrl({ id: 'dQw4w9WgXcQ', start: 90 }, 'https://quiz.example') →
  // починається з 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?'; має start=90, enablejsapi=1,
  // origin=https%3A%2F%2Fquiz.example; не містить 'autoplay'
});
it('renders nothing without a video', () => {
  // render(<YouTubePlayer video={null} />) → container порожній
});
it('shows the player and swaps it for a notice when the player reports an error', () => {
  // render з відео → iframe з title «Відео до запитання»;
  // window.dispatchEvent(new MessageEvent('message', { data: '{"event":"onError","info":150}', origin: YOUTUBE_ORIGIN, source: iframe.contentWindow }))
  // → «Відео недоступне», iframe немає
});
it('ignores messages from other origins or frames', () => {
  // той самий onError з origin 'https://evil.example' → iframe лишається; з source: window → iframe лишається
});
it('shows the notice right away when offline', () => {
  // vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false) → «Відео недоступне»
});
// PlayerScreen.test.tsx
it('a video question shows the player and no timer on the phone', () => {
  // question { video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null }, endsAt null, remainingMs null →
  // iframe з src, що містить 'youtube-nocookie.com/embed/dQw4w9WgXcQ'; queryByRole('timer') null; поля відповіді є
});
it('another player watching a board answerer sees the video too', () => {
  // поле, turn p1, me p2, question з відео → iframe є, «Відповідає Алла»
});
// HostScreen.test.tsx
it('a video question has the player, «Закрити запитання» and no ±15 s', () => {
  // question з відео, endsAt null → iframe; кнопка «Закрити запитання»; немає «−15 с» і «+15 с»
});
it('the host sees the countdown when an absent answerer will close an untimed cell', () => {
  // phase question, board.skipAt = now + 20_000, turn Алла (connected false) → «Алла відключений, клітинка закриється через 20 с»
});
// StageScreen.test.tsx
it('the stage shows the image and the video together, without a timer', () => {
  // question { imageUrl: '/uploads/…png', video: {...}, timeLimit: null } → img.question-image і iframe; queryByRole('timer') null
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web/src/screens`
Expected: FAIL (`YouTubePlayer` не існує).

- [ ] **Step 3: Implement** `YouTubePlayer`, його місця на трьох екранах, `SkipNote` на етапі `question`, ключі й стилі.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): the YouTube player on phones, host and stage, with an unavailable notice"
```

---

### Задача 6. Редактор: поле «Відео з YouTube», прихований час, «Однаковий час»

**Files:**
- Create: `apps/web/src/editor/VideoField.tsx`
- Modify: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/draft.ts` (`applyRoundTime`), `apps/web/src/editor/draft-storage.ts` (`revive`), `apps/web/src/i18n.ts`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/draft.test.ts`, `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `parseYouTubeLink`, `videoLink`, `videoSchema` (задача 1), `YouTubePlayer` (задача 5).
- Produces (`VideoField.tsx`):
  ```ts
  interface Props {
    video: Video | null;
    /** Викликається з розібраним відео або з null (порожнє чи неправильне посилання). */
    onChange: (video: Video | null) => void;
  }
  /** Поле посилання YouTube з помилкою під ним і попереднім переглядом. */
  export function VideoField({ video, onChange }: Props): JSX.Element;
  ```

**Правила:**
- **`VideoField`:**
  - тримає текст поля локально; початкове значення `video === null ? '' : videoLink(video)`;
  - на кожну зміну тексту: порожній (після `trim`) → `onChange(null)`, помилки немає; розібраний → `onChange(parsed)`; інакше → `onChange(null)` і помилка `videoInvalid` під полем (`aria-invalid`, `role="alert"` як у наявних помилок полів);
  - коли запитання змінилося ззовні (інший `question.id`), текст береться з нового `video`: `key={question.id}` на `VideoField` у `QuestionEditor`;
  - під полем `<YouTubePlayer video={video} />` і кнопка «Прибрати відео» (лише коли `video !== null`), що очищає поле й шле `null`.
- **`QuestionEditor`:**
  - `VideoField` стоїть у `stage-card` одразу після `ImageField`; оновлення через `latest.current`, як у картинки;
  - поле «Час, с» показується лише при `question.video === null`; інакше на його місці підказка `noTimerHint`: «Без таймера: запитання закриється, коли всі відповідять або ведучий його закриє».
- **`applyRoundTime`** пропускає запитання з `video !== null`: їхній `timeLimit` не змінюється. Коментар функції оновити.
- **`draft-storage.revive`:** `video: videoSchema.safeParse(question.video).success ? question.video : null`, тож стара чернетка без поля отримує `null`.
- Ключі `i18n.ts`:
  - `videoLabel`: «Відео з YouTube»;
  - `videoPlaceholder`: «Посилання на відео YouTube»;
  - `videoInvalid`: «Це не посилання на відео YouTube»;
  - `removeVideo`: «Прибрати відео»;
  - `noTimerHint`.

- [ ] **Step 1: Write the failing tests**

```ts
// draft.test.ts
it('the same time for the round skips video questions', () => {
  // classic з [A (timeLimit 20), B (video, timeLimit 25)] → applyRoundTime(round, 40): A 40, B 25.
  // Так само в полі: клітинка з відео лишає свій час
});
it('a new question has no video and changing its type keeps the video', () => {
  // newQuestion('single').video === null; changeType({ ...q, video: v }, 'text').video === v
});
it('a stored draft keeps a valid video and drops anything else', () => {
  // чернетка з video { id: 'dQw4w9WgXcQ', start: 30 } → та сама; video { url: 'x' } → null; без поля → null
});
// QuizEditor.test.tsx
it('a pasted YouTube link becomes a video with a preview and hides the time field', async () => {
  // нова вікторина; поле «Відео з YouTube» ← 'https://youtu.be/dQw4w9WgXcQ?t=1m30s' →
  // iframe з src, що містить 'embed/dQw4w9WgXcQ' і 'start=90'; поля «Час, с» немає, є «Без таймера…»;
  // зберегти → saved.rounds[0].questions[0].video === { id: 'dQw4w9WgXcQ', start: 90 }, timeLimit 30
});
it('a wrong link is a field error and leaves the question without a video', async () => {
  // ← 'https://example.com/watch?v=dQw4w9WgXcQ' → «Це не посилання на відео YouTube», iframe немає, «Час, с» є;
  // зберегти → video null
});
it('removing the video brings the time field back with the old time', async () => {
  // запитання з timeLimit 45 і відео → «Прибрати відео» → «Час, с» зі значенням 45, поле посилання порожнє
});
it('a question keeps its image when a video is added', async () => {
  // запитання з imageUrl → додати посилання → і зображення, і iframe видно; збережене має обидва
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run --maxWorkers=2 apps/web/src/editor`
Expected: FAIL.

- [ ] **Step 3: Implement** `VideoField`, правки `QuestionEditor`, `applyRoundTime`, `revive`, ключі й стиль (`.video-field` на основі `.image-field`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(editor): a YouTube link field with a preview, video questions have no time"
```

---

### Задача 7. Демо-вікторини й наскрізний сценарій

**Files:**
- Modify: `apps/server/scripts/demo-quiz.ts`, `apps/server/scripts/party-quiz.ts`, `apps/server/scripts/demo-quiz.test.ts`
- Modify: `apps/server/e2e/full-game.e2e.ts`

**Interfaces:**
- Consumes: усе попереднє; наявні допоміжні функції e2e (`open`, `click`, `field`, `join`, `questionText`, `shot`, `snapshot`, `exact`, `seconds`).

- [ ] **Step 1: Демо.**
  - У `demo-quiz.ts` додати помічник `video = (question: Question, id: string, start = 0): Question => ({ ...question, video: { id, start } })`.
  - Класичний раунд отримує `video(single('Хто співає цю пісню?', ['Rick Astley', 'Elton John', 'Phil Collins', 'Sting'], 0), 'dQw4w9WgXcQ', 43)`.
  - Бліц-раунд отримує `video(single('Назвіть гурт', ['Queen', 'ABBA', 'The Beatles', 'Pink Floyd'], 0), 'fJ9rUzIMcZQ')`.
  - `party-quiz.ts`: одна звичайна клітинка поля з телефона (наприклад, у категорії «Кіно й музика») — `video(single('Як звати співака на цьому відео?', ['Фредді Мерк\'юрі', 'Мік Джаггер', 'Елтон Джон'], 0, 300), 'fJ9rUzIMcZQ', 60)`. Клітинка заміняє одну наявну звичайну клітинку тієї ж ціни, щоб розмір поля не змінився.
  - Перед комітом виконавець відкриває `https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ` і `https://www.youtube-nocookie.com/embed/fJ9rUzIMcZQ` у браузері й переконується, що вони відтворюються у вбудованому вигляді. Якщо котрийсь ні, його замінює інший офіційний кліп, а `id` в плані й демо оновлюються.
  - `demo-quiz.test.ts`: `it('has a video question in the classic and the blitz round', …)` — `questionsOf(demoQuiz).filter((q) => q.video !== null).length >= 2`; та сама перевірка для `partyQuiz()` (≥ 1) і `quizSchema.safeParse(partyQuiz()).success`.

- [ ] **Step 2: Заглушка YouTube в e2e.** У `open` після створення контексту:

```ts
// YouTube не вантажиться з мережі: сторінка вбудовування підміняється заглушкою.
// Відео з id BROKEN_VIDEO повідомляє про помилку так само, як справжній плеєр.
await context.route(/youtube(-nocookie)?\.com|youtu\.be|ytimg\.com/, (route) =>
  route.fulfill({ contentType: 'text/html', body: youtubeStub(route.request().url()) }),
);
```

  `const BROKEN_VIDEO = 'AAAAAAAAAAA'`. `youtubeStub(url)` повертає `<!doctype html><title>stub</title>`. Для адреси з `BROKEN_VIDEO` до заглушки додається сценарій, що на перше повідомлення від батьківської сторінки (`listening`) відповідає `parent.postMessage(JSON.stringify({ event: 'onError', info: 150 }), '*')`. Так заглушка не випереджає слухача, як і справжній плеєр.

- [ ] **Step 3: Новий сценарій** `it('a video question: link with a preview in the editor, no timer anywhere, closes when everyone answered; an unavailable video', …)`, з тією ж обгорткою `try / snapshot`, що й інші.

Редактор (ведучий створює акаунт, як в інших сценаріях):
1. Класичний раунд із двома запитаннями.
2. **Запитання 1** — «Хто співає цю пісню?», варіанти «Rick Astley» (правильний) / «Sting».
   1. «Відео з YouTube» ← `https://www.example.com/x`: є «Це не посилання на відео YouTube».
   2. Потім ← `https://youtu.be/dQw4w9WgXcQ?t=1m30s`: помилки немає, у `.video-field iframe` атрибут `src` містить `youtube-nocookie.com/embed/dQw4w9WgXcQ` і `start=90`, але не `autoplay`.
   3. Поля «Час, с» немає. Знімок `video-editor`.
3. **Запитання 2** — «Так чи ні?» (boolean), «Відео з YouTube» ← `https://www.youtube.com/watch?v=AAAAAAAAAAA`.
4. «Однаковий час для всіх запитань раунду» → 40 → «Застосувати»: поле «Час, с» у запитанні 1 так і не з'явилося.
5. Зберегти, запустити гру.

Гра: гравці Алла й Богдан, сцена.
1. **Запитання 1:**
   1. На сцені, пульті й обох телефонах є `iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]` і немає `getByRole('timer')`.
   2. На пульті немає «−15 с» і «+15 с». Знімки `video-stage`, `video-phone`, `video-host`.
   3. Алла вибирає «Rick Astley». Після цього сцена все ще на етапі запитання, а на пульті є «Закрити запитання».
   4. Богдан вибирає «Sting»: на пульті з'являється «Показати відповідь» (запитання закрилося саме).
   5. «Показати відповідь» → у рахунку на пульті Алла 1000 рівно: бонусу за швидкість немає, хоча він увімкнений у раунді за замовчуванням.
2. **Запитання 2:**
   1. На сцені й телефонах «Відео недоступне», iframe немає. Знімок `video-unavailable-phone`.
   2. Ведучий тисне «Закрити запитання» без відповідей → «Показати відповідь» → гра йде далі до кінця. «Завершити гру» з підтвердженням.
3. `expect(problems).toEqual([])`.

- [ ] **Step 4: Run it**

Run: `pnpm build && npx vitest run --config apps/server/e2e/vitest.config.ts`
Expected: PASS усіх сценаріїв (наявних і нового), жодного звернення до мережі YouTube. З `E2E_SHOTS=1` в `apps/server/e2e/artifacts/shots` з'являються знімки, названі вище.

- [ ] **Step 5: Run unit tests and typecheck**

Run: `pnpm vitest run --maxWorkers=2 && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "test: a video question end-to-end, demo quizzes get YouTube clips"
```

Після фінальної рецензії гілки злити в `main`, запустити `pnpm vitest run --maxWorkers=2` і `git push origin main`. Render розгорне сам; міграцій у цьому плані немає. Після розгортання на продакшені відкрити демо-вікторину й переконатися, що плеєр відтворює відео на телефоні й сцені (CSP сторінок немає, але це єдина перевірка справжнього YouTube).
