# План 1: фундамент і рушій гри — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Монорепозиторій із пакетами `shared` (схеми даних) і `engine` (чиста логіка живої гри), повністю покритими тестами, без мережі та бази.

**Architecture:** pnpm workspaces. `packages/shared` описує вікторину, відповіді та зрізи стану через zod і TypeScript-типи. `packages/engine` реалізує перевірку відповідей, бали, рейтинг, автомат етапів гри та зрізи стану за ролями як чисті функції: стан на вході, новий стан або код помилки на виході, час передається аргументом.

**Tech Stack:** Node.js 22+, pnpm, TypeScript, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Дорожня карта підпроєкту 1

| План | Результат | Основні завдання |
|---|---|---|
| **1. Фундамент і рушій** (цей документ) | Гру можна повністю «зіграти» в тестах | монорепо, схеми, перевірка відповідей, бали, рейтинг, автомат етапів, зрізи стану |
| 2. Сервер | API і жива гра працюють через сокети, перевірено інтеграційними тестами | Fastify, Drizzle + Postgres, Better Auth, CRUD вікторин, завантаження зображень, менеджер кімнат, події Socket.IO, перепідключення, збереження результатів, історія |
| 3. Web-клієнт | У гру можна зіграти в браузері | Vite + React, токени й компоненти «Нічного ефіру», вхід, список і редактор вікторин, лобі, сцена, пульт, екран гравця, історія та статистика, i18n, PWA |
| 4. Розгортання | Застосунок доступний на Render | `render.yaml`, міграції, R2 для зображень, наскрізний тест Playwright, перевірка на реальних телефонах |

Плани 2–4 деталізуються окремими документами після завершення попереднього.

## Global Constraints

- Node.js ≥ 22, пакетний менеджер pnpm, усі пакети ESM (`"type": "module"`).
- Пакети називаються `@quiz/shared` і `@quiz/engine`; `engine` не імпортує нічого, крім `@quiz/shared`.
- `engine` не звертається до `Date.now()`, таймерів, мережі чи бази. Час приходить аргументом `now` (мілісекунди), випадковість аргументом `rng`.
- Функції `engine` не змінюють вхідний стан, а повертають новий.
- Обмеження зі специфікації: текст запитання до 300 символів; час 5–120 с, типово 20; бали 0–2000, типово 1000; 2–6 варіантів; 3–6 елементів впорядкування; 1–10 допустимих написань; до 100 запитань; до 50 гравців; нікнейм 2–20 символів, унікальний у грі.
- Формула: `бали = round(P × точність × швидкість)`; `швидкість = 1 − 0.5 × t / T`, якщо бали за швидкість увімкнено, інакше 1.
- Тести лежать поруч із кодом: `*.test.ts`. Запуск усіх: `pnpm test`.

## Review Focus

Вхідні дані, про які специфікація мовчить, але які зустрінуться в реальній грі:

1. Текстова відповідь із типографським апострофом (`’`, `ʼ`) або з розкладеними літерами Unicode (й, ї з телефонної клавіатури) має зараховуватися так само, як звичайне написання. Тест у завданні 2.
2. Числова відповідь із похибкою дробів (`0.1 + 0.2` проти `0.3`) за нульового відхилення має зараховуватися. Тест у завданні 2.
3. Відповідь із повторюваними, зайвими чи невідомими ідентифікаторами (збій або підроблений клієнт) у `multi` й `order` відхиляється без часткових балів і без падіння; невідомий варіант не потрапляє в статистику. Тести в завданнях 2 і 7.
4. Відповідь, що прийшла рівно в момент завершення часу, приймається; на 1 мс пізніше відхиляється. Тест у завданні 5.
5. Якщо останній гравець, який ще не відповів, втрачає зв'язок, запитання закривається одразу; якщо відключилися всі й ніхто не відповів, запитання чекає таймера. Тести в завданні 5.

---

## Структура файлів

```
package.json                     кореневі скрипти test, typecheck
pnpm-workspace.yaml
tsconfig.base.json
packages/shared/
  package.json, tsconfig.json
  src/quiz.ts                    LIMITS, схеми запитання й вікторини
  src/answer.ts                  схема відповіді гравця
  src/game.ts                    Phase, ErrorCode
  src/standing.ts                Standing
  src/views.ts                   StageView, PlayerView, HostView
  src/index.ts
packages/engine/
  package.json, tsconfig.json
  src/normalize.ts               нормалізація тексту
  src/check.ts                   перевірка відповіді за типом
  src/score.ts                   бали
  src/ranking.ts                 рейтинг
  src/game.ts                    стан гри й переходи
  src/views.ts                   зрізи стану за ролями
  src/testing/fixtures.ts        тестові запитання
  src/testing/helpers.ts         must(), lobbyWith()
  src/index.ts
```

---

### Task 1: Монорепозиторій і схеми вікторини

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/quiz.ts`, `packages/shared/src/answer.ts`, `packages/shared/src/index.ts`
- Test: `packages/shared/src/quiz.test.ts`

**Interfaces:**
- Consumes: нічого.
- Produces: `LIMITS`, `questionSchema`, `quizSettingsSchema`, `quizSchema`, `DEFAULT_SETTINGS`, `answerSchema`; типи `Question`, `Quiz`, `QuizSettings`, `Answer`.

- [ ] **Step 1: Перевірити інструменти**

Run: `node -v` і `pnpm -v`
Expected: Node 22 або новіший; pnpm установлено. Якщо pnpm немає: `npm install -g pnpm`.

- [ ] **Step 2: Створити кореневі файли**

`package.json`:

```json
{
  "name": "quiz",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p packages/shared && tsc -p packages/engine"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`packages/shared/package.json`:

```json
{
  "name": "@quiz/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/shared/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 3: Встановити залежності**

Run:

```bash
pnpm add -Dw typescript vitest
pnpm --filter @quiz/shared add zod
```

Expected: з'явилися `node_modules` і `pnpm-lock.yaml`, помилок немає.

- [ ] **Step 4: Написати тест, що падає**

`packages/shared/src/quiz.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, answerSchema, questionSchema, quizSchema } from './index';

const single = {
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  imageUrl: null,
  timeLimit: 20,
  points: 1000,
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
  ],
  correctId: 'b',
};

const valid = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('questionSchema', () => {
  it('accepts a valid single-choice question', () => {
    expect(valid(questionSchema, single)).toBe(true);
  });

  it('rejects a correct id that is not among the options', () => {
    expect(valid(questionSchema, { ...single, correctId: 'z' })).toBe(false);
  });

  it('rejects duplicate option ids', () => {
    const options = [
      { id: 'a', text: 'Львів' },
      { id: 'a', text: 'Київ' },
    ];
    expect(valid(questionSchema, { ...single, options, correctId: 'a' })).toBe(false);
  });

  it('rejects a time limit outside 5–120 seconds', () => {
    expect(valid(questionSchema, { ...single, timeLimit: 4 })).toBe(false);
    expect(valid(questionSchema, { ...single, timeLimit: 121 })).toBe(false);
  });

  it('rejects multi-choice with a repeated correct id', () => {
    const multi = { ...single, type: 'multi', correctIds: ['a', 'a'] };
    expect(valid(questionSchema, multi)).toBe(false);
  });

  it('rejects an order question with fewer than three items', () => {
    const order = {
      id: 'q6',
      type: 'order',
      text: 'Розташуйте міста з заходу на схід',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      items: [
        { id: 'l', text: 'Львів' },
        { id: 'k', text: 'Київ' },
      ],
    };
    expect(valid(questionSchema, order)).toBe(false);
  });

  it('rejects a negative numeric tolerance', () => {
    const numeric = {
      id: 'q5',
      type: 'numeric',
      text: 'Яка висота Говерли в метрах?',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      correct: 2061,
      tolerance: -1,
    };
    expect(valid(questionSchema, numeric)).toBe(false);
  });
});

describe('quizSchema', () => {
  const quiz = { title: 'Географія', description: '', settings: DEFAULT_SETTINGS, questions: [single] };

  it('accepts a quiz with one question', () => {
    expect(valid(quizSchema, quiz)).toBe(true);
  });

  it('rejects a quiz without questions', () => {
    expect(valid(quizSchema, { ...quiz, questions: [] })).toBe(false);
  });
});

describe('answerSchema', () => {
  it('accepts an answer of each type', () => {
    expect(valid(answerSchema, { type: 'single', optionId: 'a' })).toBe(true);
    expect(valid(answerSchema, { type: 'multi', optionIds: ['a', 'c'] })).toBe(true);
    expect(valid(answerSchema, { type: 'boolean', value: true })).toBe(true);
    expect(valid(answerSchema, { type: 'text', value: 'Одеса' })).toBe(true);
    expect(valid(answerSchema, { type: 'numeric', value: 2061 })).toBe(true);
    expect(valid(answerSchema, { type: 'order', itemIds: ['u', 'l', 'k'] })).toBe(true);
  });

  it('rejects a numeric answer that is not a finite number', () => {
    expect(valid(answerSchema, { type: 'numeric', value: Number.NaN })).toBe(false);
    expect(valid(answerSchema, { type: 'numeric', value: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('rejects a text answer longer than 200 characters', () => {
    expect(valid(answerSchema, { type: 'text', value: 'я'.repeat(201) })).toBe(false);
  });
});
```

- [ ] **Step 5: Переконатися, що тест падає**

Run: `pnpm vitest run packages/shared`
Expected: FAIL, бо `./index` не існує.

- [ ] **Step 6: Написати реалізацію**

`packages/shared/src/quiz.ts`:

```ts
import { z } from 'zod';

export const LIMITS = {
  questionText: 300,
  optionText: 120,
  answerText: 200,
  minTime: 5,
  maxTime: 120,
  defaultTime: 20,
  maxPoints: 2000,
  defaultPoints: 1000,
  minOptions: 2,
  maxOptions: 6,
  minOrderItems: 3,
  maxOrderItems: 6,
  maxAccepted: 10,
  maxQuestions: 100,
  maxPlayers: 50,
  nicknameMin: 2,
  nicknameMax: 20,
} as const;

const choice = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(LIMITS.optionText),
});

const base = {
  id: z.string().min(1),
  text: z.string().trim().min(1).max(LIMITS.questionText),
  imageUrl: z.string().min(1).nullable(),
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime),
  points: z.number().int().min(0).max(LIMITS.maxPoints),
};

const options = z.array(choice).min(LIMITS.minOptions).max(LIMITS.maxOptions);

const hasDuplicates = (ids: string[]) => new Set(ids).size !== ids.length;

export const questionSchema = z
  .discriminatedUnion('type', [
    z.object({ ...base, type: z.literal('single'), options, correctId: z.string() }),
    z.object({ ...base, type: z.literal('multi'), options, correctIds: z.array(z.string()).min(1) }),
    z.object({ ...base, type: z.literal('boolean'), correct: z.boolean() }),
    z.object({
      ...base,
      type: z.literal('text'),
      accepted: z.array(z.string().trim().min(1).max(LIMITS.answerText)).min(1).max(LIMITS.maxAccepted),
    }),
    z.object({
      ...base,
      type: z.literal('numeric'),
      correct: z.number().finite(),
      tolerance: z.number().finite().min(0),
    }),
    z.object({
      ...base,
      type: z.literal('order'),
      // Елементи зберігаються в правильному порядку.
      items: z.array(choice).min(LIMITS.minOrderItems).max(LIMITS.maxOrderItems),
    }),
  ])
  .superRefine((q, ctx) => {
    const ids =
      q.type === 'single' || q.type === 'multi'
        ? q.options.map((o) => o.id)
        : q.type === 'order'
          ? q.items.map((i) => i.id)
          : [];
    if (hasDuplicates(ids)) ctx.addIssue({ code: 'custom', message: 'duplicate_ids' });
    if (q.type === 'single' && !ids.includes(q.correctId)) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
    if (q.type === 'multi' && (hasDuplicates(q.correctIds) || !q.correctIds.every((id) => ids.includes(id)))) {
      ctx.addIssue({ code: 'custom', message: 'unknown_correct_id' });
    }
  });

export type Question = z.infer<typeof questionSchema>;

export const quizSettingsSchema = z.object({
  speedBonus: z.boolean(),
  leaderboard: z.enum(['each', 'end']),
  shuffleOptions: z.boolean(),
});

export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const DEFAULT_SETTINGS: QuizSettings = {
  speedBonus: true,
  leaderboard: 'each',
  shuffleOptions: false,
};

export const quizSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(500),
  settings: quizSettingsSchema,
  questions: z.array(questionSchema).min(1).max(LIMITS.maxQuestions),
});

export type Quiz = z.infer<typeof quizSchema>;
```

`packages/shared/src/answer.ts`:

```ts
import { z } from 'zod';
import { LIMITS } from './quiz';

const id = z.string().min(1).max(64);

export const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single'), optionId: id }),
  z.object({ type: z.literal('multi'), optionIds: z.array(id).max(LIMITS.maxOptions) }),
  z.object({ type: z.literal('boolean'), value: z.boolean() }),
  z.object({ type: z.literal('text'), value: z.string().max(LIMITS.answerText) }),
  z.object({ type: z.literal('numeric'), value: z.number().finite() }),
  z.object({ type: z.literal('order'), itemIds: z.array(id).max(LIMITS.maxOrderItems) }),
]);

export type Answer = z.infer<typeof answerSchema>;
```

`packages/shared/src/index.ts`:

```ts
export * from './quiz';
export * from './answer';
```

- [ ] **Step 7: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/shared`
Expected: PASS, 12 тестів.

Run: `pnpm tsc -p packages/shared`
Expected: без помилок.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json packages/shared
git commit -m "feat: scaffold monorepo and quiz schemas"
```

---

### Task 2: Нормалізація тексту й перевірка відповідей

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`
- Create: `packages/engine/src/normalize.ts`, `packages/engine/src/check.ts`, `packages/engine/src/index.ts`
- Create: `packages/engine/src/testing/fixtures.ts`
- Test: `packages/engine/src/normalize.test.ts`, `packages/engine/src/check.test.ts`

**Interfaces:**
- Consumes: `Question`, `Quiz`, `QuizSettings`, `Answer`, `DEFAULT_SETTINGS` з `@quiz/shared`.
- Produces:
  - `normalizeText(value: string): string`
  - `interface CheckResult { accepted: boolean; accuracy: number }`
  - `checkAnswer(question: Question, answer: Answer): CheckResult`
  - фікстури `single`, `multi`, `bool`, `text`, `numeric`, `order`, `makeQuiz(questions?, settings?)`

- [ ] **Step 1: Створити пакет**

`packages/engine/package.json`:

```json
{
  "name": "@quiz/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/engine/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

Run: `pnpm --filter @quiz/engine add @quiz/shared --workspace`
Expected: у `packages/engine/package.json` з'явилась залежність `"@quiz/shared": "workspace:*"`.

- [ ] **Step 2: Створити фікстури**

`packages/engine/src/testing/fixtures.ts`:

```ts
import { DEFAULT_SETTINGS, type Question, type Quiz, type QuizSettings } from '@quiz/shared';

const base = { imageUrl: null, timeLimit: 20, points: 1000 };

export const single = {
  ...base,
  id: 'q1',
  type: 'single',
  text: 'Столиця України?',
  options: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
  ],
  correctId: 'b',
} satisfies Question;

export const multi = {
  ...base,
  id: 'q2',
  type: 'multi',
  text: 'Які з цих міст стоять на Дніпрі?',
  options: [
    { id: 'a', text: 'Київ' },
    { id: 'b', text: 'Львів' },
    { id: 'c', text: 'Черкаси' },
    { id: 'd', text: 'Одеса' },
  ],
  correctIds: ['a', 'c'],
} satisfies Question;

export const bool = {
  ...base,
  id: 'q3',
  type: 'boolean',
  text: 'Говерла є найвищою горою України',
  correct: true,
} satisfies Question;

export const text = {
  ...base,
  id: 'q4',
  type: 'text',
  text: 'Яке місто називають перлиною біля моря?',
  accepted: ['Одеса'],
} satisfies Question;

export const numeric = {
  ...base,
  id: 'q5',
  type: 'numeric',
  text: 'Яка висота Говерли в метрах?',
  correct: 2061,
  tolerance: 100,
} satisfies Question;

export const order = {
  ...base,
  id: 'q6',
  type: 'order',
  text: 'Розташуйте міста з заходу на схід',
  items: [
    { id: 'u', text: 'Ужгород' },
    { id: 'l', text: 'Львів' },
    { id: 'k', text: 'Київ' },
    { id: 'h', text: 'Харків' },
  ],
} satisfies Question;

export function makeQuiz(
  questions: Question[] = [single, multi, bool, text, numeric, order],
  settings: Partial<QuizSettings> = {},
): Quiz {
  return {
    title: 'Тестова вікторина',
    description: '',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    questions,
  };
}
```

- [ ] **Step 3: Написати тести, що падають**

`packages/engine/src/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeText } from './normalize';

describe('normalizeText', () => {
  it('trims, collapses spaces and lowercases', () => {
    expect(normalizeText('  Івано   Франківськ ')).toBe('івано франківськ');
  });

  it('treats every apostrophe variant as the same character', () => {
    const expected = normalizeText("Кам'янець");
    expect(normalizeText('Кам’янець')).toBe(expected);
    expect(normalizeText('Камʼянець')).toBe(expected);
    expect(normalizeText('Кам`янець')).toBe(expected);
  });

  it('treats decomposed Unicode letters as composed ones', () => {
    expect(normalizeText('Київ'.normalize('NFD'))).toBe(normalizeText('Київ'));
    expect(normalizeText('Йосип'.normalize('NFD'))).toBe(normalizeText('Йосип'));
  });

  it('unifies quotation marks', () => {
    expect(normalizeText('«Кобзар»')).toBe('"кобзар"');
    expect(normalizeText('“Кобзар”')).toBe('"кобзар"');
  });
});
```

`packages/engine/src/check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkAnswer } from './check';
import { bool, multi, numeric, order, single, text } from './testing/fixtures';

const REJECTED = { accepted: false, accuracy: 0 };
const FULL = { accepted: true, accuracy: 1 };

describe('checkAnswer', () => {
  it('rejects an answer of a different type', () => {
    expect(checkAnswer(single, { type: 'boolean', value: true })).toEqual(REJECTED);
  });

  it('single: accepts only the correct option', () => {
    expect(checkAnswer(single, { type: 'single', optionId: 'b' })).toEqual(FULL);
    expect(checkAnswer(single, { type: 'single', optionId: 'a' })).toEqual(REJECTED);
  });

  it('multi: accepts the exact set in any order', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['c', 'a'] })).toEqual(FULL);
  });

  it('multi: rejects a subset, a superset and unknown ids', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a'] })).toEqual(REJECTED);
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'b', 'c'] })).toEqual(REJECTED);
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'c', 'zzz'] })).toEqual(REJECTED);
  });

  it('multi: ignores repeated ids in the answer', () => {
    expect(checkAnswer(multi, { type: 'multi', optionIds: ['a', 'a', 'c'] })).toEqual(FULL);
  });

  it('boolean: compares the value', () => {
    expect(checkAnswer(bool, { type: 'boolean', value: true })).toEqual(FULL);
    expect(checkAnswer(bool, { type: 'boolean', value: false })).toEqual(REJECTED);
  });

  it('text: compares after normalization', () => {
    expect(checkAnswer(text, { type: 'text', value: '  ОДЕСА ' })).toEqual(FULL);
    expect(checkAnswer(text, { type: 'text', value: 'Адеса' })).toEqual(REJECTED);
  });

  it('text: rejects an empty answer', () => {
    expect(checkAnswer(text, { type: 'text', value: '   ' })).toEqual(REJECTED);
  });

  it('text: accepts a typographic apostrophe', () => {
    const question = { ...text, accepted: ["Кам'янець-Подільський"] };
    expect(checkAnswer(question, { type: 'text', value: 'кам’янець-подільський' })).toEqual(FULL);
  });

  it('numeric: full accuracy for the exact value, half at the tolerance edge', () => {
    expect(checkAnswer(numeric, { type: 'numeric', value: 2061 })).toEqual(FULL);
    expect(checkAnswer(numeric, { type: 'numeric', value: 2111 })).toEqual({ accepted: true, accuracy: 0.75 });
    expect(checkAnswer(numeric, { type: 'numeric', value: 1961 })).toEqual({ accepted: true, accuracy: 0.5 });
  });

  it('numeric: rejects a value outside the tolerance', () => {
    expect(checkAnswer(numeric, { type: 'numeric', value: 2162 })).toEqual(REJECTED);
  });

  it('numeric: with zero tolerance accepts only the exact value', () => {
    const exact = { ...numeric, tolerance: 0 };
    expect(checkAnswer(exact, { type: 'numeric', value: 2061 })).toEqual(FULL);
    expect(checkAnswer(exact, { type: 'numeric', value: 2062 })).toEqual(REJECTED);
  });

  it('numeric: tolerates floating point error', () => {
    const exact = { ...numeric, correct: 0.3, tolerance: 0 };
    expect(checkAnswer(exact, { type: 'numeric', value: 0.1 + 0.2 })).toEqual(FULL);
  });

  it('order: accuracy is the share of items in place', () => {
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k', 'h'] })).toEqual(FULL);
    expect(checkAnswer(order, { type: 'order', itemIds: ['l', 'u', 'k', 'h'] })).toEqual({
      accepted: false,
      accuracy: 0.5,
    });
    expect(checkAnswer(order, { type: 'order', itemIds: ['h', 'k', 'l', 'u'] })).toEqual(REJECTED);
  });

  it('order: rejects repeated, missing or unknown ids without partial credit', () => {
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'u', 'k', 'h'] })).toEqual(REJECTED);
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k'] })).toEqual(REJECTED);
    expect(checkAnswer(order, { type: 'order', itemIds: ['u', 'l', 'k', 'zzz'] })).toEqual(REJECTED);
  });
});
```

- [ ] **Step 4: Переконатися, що тести падають**

Run: `pnpm vitest run packages/engine`
Expected: FAIL, бо `./normalize` і `./check` не існують.

- [ ] **Step 5: Написати реалізацію**

`packages/engine/src/normalize.ts`:

```ts
export function normalizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[’ʼ`‘]/g, "'")
    .replace(/[“”«»„]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

`packages/engine/src/check.ts`:

```ts
import type { Answer, Question } from '@quiz/shared';
import { normalizeText } from './normalize';

export interface CheckResult {
  accepted: boolean;
  accuracy: number;
}

const REJECTED: CheckResult = { accepted: false, accuracy: 0 };
const FULL: CheckResult = { accepted: true, accuracy: 1 };
const EPSILON = 1e-9;

const full = (correct: boolean): CheckResult => (correct ? FULL : REJECTED);

export function checkAnswer(question: Question, answer: Answer): CheckResult {
  if (question.type === 'single' && answer.type === 'single') {
    return full(answer.optionId === question.correctId);
  }

  if (question.type === 'multi' && answer.type === 'multi') {
    const chosen = new Set(answer.optionIds);
    return full(chosen.size === question.correctIds.length && question.correctIds.every((id) => chosen.has(id)));
  }

  if (question.type === 'boolean' && answer.type === 'boolean') {
    return full(answer.value === question.correct);
  }

  if (question.type === 'text' && answer.type === 'text') {
    const value = normalizeText(answer.value);
    return full(value !== '' && question.accepted.some((spelling) => normalizeText(spelling) === value));
  }

  if (question.type === 'numeric' && answer.type === 'numeric') {
    const distance = Math.abs(answer.value - question.correct);
    if (!Number.isFinite(distance) || distance > question.tolerance + EPSILON) return REJECTED;
    if (question.tolerance === 0) return FULL;
    return { accepted: true, accuracy: 1 - 0.5 * Math.min(distance / question.tolerance, 1) };
  }

  if (question.type === 'order' && answer.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const given = answer.itemIds;
    const isPermutation =
      given.length === ids.length && new Set(given).size === ids.length && given.every((id) => ids.includes(id));
    if (!isPermutation) return REJECTED;
    const inPlace = ids.filter((id, index) => given[index] === id).length;
    if (inPlace === 0) return REJECTED;
    return { accepted: inPlace === ids.length, accuracy: inPlace / ids.length };
  }

  return REJECTED;
}
```

`packages/engine/src/index.ts`:

```ts
export * from './normalize';
export * from './check';
```

- [ ] **Step 6: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 19 тестів (4 + 15).

- [ ] **Step 7: Commit**

```bash
git add packages/engine pnpm-lock.yaml
git commit -m "feat(engine): normalize text and check answers for all question types"
```

---

### Task 3: Бали й рейтинг

**Files:**
- Create: `packages/shared/src/standing.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/engine/src/score.ts`, `packages/engine/src/ranking.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/score.test.ts`, `packages/engine/src/ranking.test.ts`

**Interfaces:**
- Consumes: нічого з попередніх завдань.
- Produces:
  - `interface Standing { participantId: string; nickname: string; score: number; totalTimeMs: number; rank: number }` у `@quiz/shared`
  - `speedFactor(timeMs: number, limitMs: number, speedBonus: boolean): number`
  - `scorePoints(points: number, accuracy: number, speed: number): number`
  - `interface Ranked { id: string; nickname: string; score: number; totalTimeMs: number }`
  - `rankPlayers(players: Ranked[]): Standing[]`

- [ ] **Step 1: Додати тип Standing**

`packages/shared/src/standing.ts`:

```ts
export interface Standing {
  participantId: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
  rank: number;
}
```

`packages/shared/src/index.ts` (повний вміст):

```ts
export * from './quiz';
export * from './answer';
export * from './standing';
```

- [ ] **Step 2: Написати тести, що падають**

`packages/engine/src/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scorePoints, speedFactor } from './score';

describe('speedFactor', () => {
  it('is 1 when the speed bonus is off', () => {
    expect(speedFactor(19_000, 20_000, false)).toBe(1);
  });

  it('falls linearly from 1 to 0.5 over the time limit', () => {
    expect(speedFactor(0, 20_000, true)).toBe(1);
    expect(speedFactor(10_000, 20_000, true)).toBe(0.75);
    expect(speedFactor(20_000, 20_000, true)).toBe(0.5);
  });

  it('stays within 0.5–1 for times outside the limit', () => {
    expect(speedFactor(-500, 20_000, true)).toBe(1);
    expect(speedFactor(99_000, 20_000, true)).toBe(0.5);
  });
});

describe('scorePoints', () => {
  it('multiplies points by accuracy and speed and rounds', () => {
    expect(scorePoints(1000, 1, 1)).toBe(1000);
    expect(scorePoints(1000, 0.75, 0.75)).toBe(563);
    expect(scorePoints(1000, 0, 1)).toBe(0);
  });
});
```

`packages/engine/src/ranking.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rankPlayers } from './ranking';

const player = (id: string, score: number, totalTimeMs: number) => ({ id, nickname: id, score, totalTimeMs });

describe('rankPlayers', () => {
  it('orders by score, highest first', () => {
    const standings = rankPlayers([player('a', 100, 0), player('b', 300, 0), player('c', 200, 0)]);
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
    ]);
  });

  it('breaks a score tie by the lower total time', () => {
    const standings = rankPlayers([player('slow', 500, 9000), player('fast', 500, 4000)]);
    expect(standings.map((s) => [s.participantId, s.rank])).toEqual([
      ['fast', 1],
      ['slow', 2],
    ]);
  });

  it('gives equal score and time the same rank and skips the next one', () => {
    const standings = rankPlayers([player('a', 500, 4000), player('b', 500, 4000), player('c', 100, 4000)]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it('returns an empty list for no players', () => {
    expect(rankPlayers([])).toEqual([]);
  });
});
```

- [ ] **Step 3: Переконатися, що тести падають**

Run: `pnpm vitest run packages/engine/src/score.test.ts packages/engine/src/ranking.test.ts`
Expected: FAIL, модулі не існують.

- [ ] **Step 4: Написати реалізацію**

`packages/engine/src/score.ts`:

```ts
export function speedFactor(timeMs: number, limitMs: number, speedBonus: boolean): number {
  if (!speedBonus) return 1;
  const used = Math.min(Math.max(timeMs / limitMs, 0), 1);
  return 1 - 0.5 * used;
}

export function scorePoints(points: number, accuracy: number, speed: number): number {
  return Math.round(points * accuracy * speed);
}
```

`packages/engine/src/ranking.ts`:

```ts
import type { Standing } from '@quiz/shared';

export interface Ranked {
  id: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
}

export function rankPlayers(players: Ranked[]): Standing[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.nickname.localeCompare(b.nickname),
  );
  const standings: Standing[] = [];
  sorted.forEach((player, index) => {
    const previous = standings[index - 1];
    const tied =
      previous !== undefined && previous.score === player.score && previous.totalTimeMs === player.totalTimeMs;
    standings.push({
      participantId: player.id,
      nickname: player.nickname,
      score: player.score,
      totalTimeMs: player.totalTimeMs,
      rank: tied ? previous.rank : index + 1,
    });
  });
  return standings;
}
```

`packages/engine/src/index.ts` (повний вміст):

```ts
export * from './normalize';
export * from './check';
export * from './score';
export * from './ranking';
```

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 27 тестів.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): add scoring formula and ranking"
```

---

### Task 4: Стан гри та лобі

**Files:**
- Create: `packages/shared/src/game.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/engine/src/game.ts`, `packages/engine/src/testing/helpers.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/game.lobby.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `Quiz`, `Answer` з `@quiz/shared`; `normalizeText`.
- Produces:
  - у `@quiz/shared`: `type Phase = 'lobby' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'finished'`; `type ErrorCode`
  - `interface PlayerState { id: string; nickname: string; connected: boolean; score: number; totalTimeMs: number }`
  - `interface AnswerRecord { answer: Answer; timeMs: number; accepted: boolean; accuracy: number; points: number; overridden: boolean }`
  - `interface GameState { quiz; phase; questionIndex; players; answers; presented; startedAt; endsAt; paused; remainingMs }`
  - `type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode }`
  - `createGame(quiz: Quiz): GameState`
  - `addPlayer(state: GameState, player: { id: string; nickname: string }): Result`
  - `removePlayer(state: GameState, playerId: string): Result`
  - `setConnected(state: GameState, playerId: string, connected: boolean): Result`
  - `recordOf(state: GameState, questionIndex: number, playerId: string): AnswerRecord | undefined`
  - тестові помічники `must(result: Result): GameState`, `lobbyWith(quiz: Quiz, ...nicknames: string[]): GameState` (гравці отримують id `p1`, `p2`, …)

- [ ] **Step 1: Додати спільні типи**

`packages/shared/src/game.ts`:

```ts
export type Phase = 'lobby' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'finished';

export type ErrorCode =
  | 'wrong_phase'
  | 'paused'
  | 'not_found'
  | 'no_players'
  | 'room_full'
  | 'nickname_invalid'
  | 'nickname_taken'
  | 'already_answered'
  | 'time_over'
  | 'type_mismatch';
```

`packages/shared/src/index.ts` (повний вміст):

```ts
export * from './quiz';
export * from './answer';
export * from './standing';
export * from './game';
```

- [ ] **Step 2: Написати тест, що падає**

`packages/engine/src/game.lobby.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addPlayer, createGame, removePlayer, setConnected } from './game';
import { makeQuiz } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const quiz = makeQuiz();

describe('lobby', () => {
  it('starts empty in the lobby phase', () => {
    const state = createGame(quiz);
    expect(state.phase).toBe('lobby');
    expect(state.questionIndex).toBe(-1);
    expect(state.players).toEqual([]);
    expect(state.answers).toHaveLength(quiz.questions.length);
  });

  it('adds a connected player with a zero score', () => {
    const state = must(addPlayer(createGame(quiz), { id: 'p1', nickname: 'Олена' }));
    expect(state.players).toEqual([{ id: 'p1', nickname: 'Олена', connected: true, score: 0, totalTimeMs: 0 }]);
  });

  it('does not mutate the previous state', () => {
    const before = createGame(quiz);
    must(addPlayer(before, { id: 'p1', nickname: 'Олена' }));
    expect(before.players).toEqual([]);
  });

  it('cleans up spaces in a nickname', () => {
    const state = must(addPlayer(createGame(quiz), { id: 'p1', nickname: '  Олена   К ' }));
    expect(state.players[0].nickname).toBe('Олена К');
  });

  it('rejects a nickname shorter than 2 or longer than 20 characters', () => {
    expect(addPlayer(createGame(quiz), { id: 'p1', nickname: ' О ' })).toEqual({ ok: false, error: 'nickname_invalid' });
    expect(addPlayer(createGame(quiz), { id: 'p1', nickname: 'О'.repeat(21) })).toEqual({
      ok: false,
      error: 'nickname_invalid',
    });
  });

  it('rejects a nickname that differs only by case or spacing', () => {
    const state = lobbyWith(quiz, 'Олена');
    expect(addPlayer(state, { id: 'p2', nickname: ' олена ' })).toEqual({ ok: false, error: 'nickname_taken' });
  });

  it('rejects the 51st player', () => {
    const names = Array.from({ length: 50 }, (_, i) => `Гравець ${i + 1}`);
    const state = lobbyWith(quiz, ...names);
    expect(addPlayer(state, { id: 'extra', nickname: 'Зайвий' })).toEqual({ ok: false, error: 'room_full' });
  });

  it('removes a player', () => {
    const state = must(removePlayer(lobbyWith(quiz, 'Олена', 'Тарас'), 'p1'));
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
  });

  it('reports an unknown player on remove and on connection change', () => {
    const state = lobbyWith(quiz, 'Олена');
    expect(removePlayer(state, 'nobody')).toEqual({ ok: false, error: 'not_found' });
    expect(setConnected(state, 'nobody', false)).toEqual({ ok: false, error: 'not_found' });
  });

  it('marks a player as disconnected and connected again', () => {
    const offline = must(setConnected(lobbyWith(quiz, 'Олена'), 'p1', false));
    expect(offline.players[0].connected).toBe(false);
    expect(must(setConnected(offline, 'p1', true)).players[0].connected).toBe(true);
  });
});
```

- [ ] **Step 3: Переконатися, що тест падає**

Run: `pnpm vitest run packages/engine/src/game.lobby.test.ts`
Expected: FAIL, бо `./game` не існує.

- [ ] **Step 4: Написати реалізацію**

`packages/engine/src/game.ts`:

```ts
import { LIMITS, type Answer, type ErrorCode, type Phase, type Quiz } from '@quiz/shared';
import { normalizeText } from './normalize';

export interface PlayerState {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  totalTimeMs: number;
}

export interface AnswerRecord {
  answer: Answer;
  timeMs: number;
  accepted: boolean;
  accuracy: number;
  points: number;
  overridden: boolean;
}

export interface GameState {
  quiz: Quiz;
  phase: Phase;
  /** -1 у лобі. */
  questionIndex: number;
  players: PlayerState[];
  /** Індекс масиву дорівнює індексу запитання; ключ об'єкта є id гравця. */
  answers: Record<string, AnswerRecord>[];
  /** Порядок варіантів або елементів поточного запитання, однаковий для всіх. */
  presented: string[];
  startedAt: number | null;
  endsAt: number | null;
  paused: boolean;
  /** Залишок часу запитання під час паузи. */
  remainingMs: number | null;
}

export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export const ok = (state: GameState): Result => ({ ok: true, state });
export const fail = (error: ErrorCode): Result => ({ ok: false, error });

export function createGame(quiz: Quiz): GameState {
  return {
    quiz,
    phase: 'lobby',
    questionIndex: -1,
    players: [],
    answers: quiz.questions.map(() => ({})),
    presented: [],
    startedAt: null,
    endsAt: null,
    paused: false,
    remainingMs: null,
  };
}

export function recordOf(state: GameState, questionIndex: number, playerId: string): AnswerRecord | undefined {
  const byPlayer = state.answers[questionIndex];
  return byPlayer !== undefined && Object.hasOwn(byPlayer, playerId) ? byPlayer[playerId] : undefined;
}

export function addPlayer(state: GameState, player: { id: string; nickname: string }): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  const nickname = player.nickname.replace(/\s+/g, ' ').trim();
  if (nickname.length < LIMITS.nicknameMin || nickname.length > LIMITS.nicknameMax) return fail('nickname_invalid');
  if (state.players.length >= LIMITS.maxPlayers) return fail('room_full');
  const key = normalizeText(nickname);
  if (state.players.some((p) => normalizeText(p.nickname) === key)) return fail('nickname_taken');
  const added: PlayerState = { id: player.id, nickname, connected: true, score: 0, totalTimeMs: 0 };
  return ok({ ...state, players: [...state.players, added] });
}

export function removePlayer(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const answers = state.answers.map((byPlayer) => {
    const { [playerId]: _removed, ...rest } = byPlayer;
    return rest;
  });
  return ok({ ...state, players: state.players.filter((p) => p.id !== playerId), answers });
}

export function setConnected(state: GameState, playerId: string, connected: boolean): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return ok({ ...state, players });
}
```

`packages/engine/src/testing/helpers.ts`:

```ts
import type { Quiz } from '@quiz/shared';
import { addPlayer, createGame, type GameState, type Result } from '../game';

export function must(result: Result): GameState {
  if (!result.ok) throw new Error(`unexpected engine error: ${result.error}`);
  return result.state;
}

/** Лобі з гравцями, які отримують id p1, p2, … у порядку аргументів. */
export function lobbyWith(quiz: Quiz, ...nicknames: string[]): GameState {
  return nicknames.reduce(
    (state, nickname, index) => must(addPlayer(state, { id: `p${index + 1}`, nickname })),
    createGame(quiz),
  );
}
```

`packages/engine/src/index.ts` (повний вміст):

```ts
export * from './normalize';
export * from './check';
export * from './score';
export * from './ranking';
export * from './game';
```

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 37 тестів.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): add game state and lobby operations"
```

---

### Task 5: Хід гри: старт, відповіді, закриття, переходи

**Files:**
- Modify: `packages/engine/src/game.ts` (додати імпорти й функції в кінець; замінити тіла `removePlayer` і `setConnected`)
- Test: `packages/engine/src/game.flow.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Result`, `ok`, `fail`, `recordOf` (завдання 4); `checkAnswer` (завдання 2); `scorePoints`, `speedFactor` (завдання 3).
- Produces:
  - `type Rng = () => number`
  - `start(state: GameState, now: number, rng?: Rng): Result`
  - `submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result`
  - `lock(state: GameState): Result`
  - `tick(state: GameState, now: number): GameState`
  - `next(state: GameState, now: number, rng?: Rng): Result`
  - внутрішні `autoLock(state)`, `withTotals(state)`, `lockNow(state)`, `openQuestion(state, index, now, rng)`; `autoLock` і `withTotals` використовує завдання 6
  - `removePlayer` і `setConnected` тепер закривають запитання, якщо всі підключені гравці вже відповіли

- [ ] **Step 1: Написати тест, що падає**

`packages/engine/src/game.flow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  createGame,
  lock,
  next,
  recordOf,
  removePlayer,
  setConnected,
  start,
  submitAnswer,
  tick,
} from './game';
import { makeQuiz, order, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const started = () => must(start(lobbyWith(quiz, 'Олена', 'Тарас'), T0));
const scores = (state: { players: { score: number; totalTimeMs: number }[] }) =>
  state.players.map((p) => [p.score, p.totalTimeMs]);

describe('start', () => {
  it('requires at least one player', () => {
    expect(start(createGame(quiz), T0)).toEqual({ ok: false, error: 'no_players' });
  });

  it('opens the first question with a deadline', () => {
    const state = started();
    expect(state.phase).toBe('question');
    expect(state.questionIndex).toBe(0);
    expect(state.startedAt).toBe(T0);
    expect(state.endsAt).toBe(T0 + 20_000);
    expect(state.presented).toEqual(['a', 'b', 'c']);
  });

  it('cannot be called twice', () => {
    expect(start(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('closes the room to new players', () => {
    expect(addPlayer(started(), { id: 'p3', nickname: 'Ірина' })).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('submitAnswer', () => {
  it('records a correct answer scored by speed, without touching totals yet', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    expect(recordOf(state, 0, 'p1')).toEqual({
      answer: correct,
      timeMs: 10_000,
      accepted: true,
      accuracy: 1,
      points: 750,
      overridden: false,
    });
    expect(state.phase).toBe('question');
    expect(state.players[0].score).toBe(0);
  });

  it('gives full points regardless of time when the speed bonus is off', () => {
    const flat = makeQuiz([single], { speedBonus: false });
    const state = must(submitAnswer(must(start(lobbyWith(flat, 'Олена', 'Тарас'), T0)), 'p1', correct, T0 + 19_000));
    expect(recordOf(state, 0, 'p1')?.points).toBe(1000);
  });

  it('rejects a second answer from the same player', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(submitAnswer(state, 'p1', wrong, T0 + 2000)).toEqual({ ok: false, error: 'already_answered' });
  });

  it('accepts an answer exactly at the deadline and rejects one a millisecond later', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 20_000));
    expect(recordOf(state, 0, 'p1')?.points).toBe(500);
    expect(submitAnswer(state, 'p2', correct, T0 + 20_001)).toEqual({ ok: false, error: 'time_over' });
  });

  it('rejects an answer of the wrong type', () => {
    expect(submitAnswer(started(), 'p1', { type: 'boolean', value: true }, T0 + 1000)).toEqual({
      ok: false,
      error: 'type_mismatch',
    });
  });

  it('rejects an unknown player', () => {
    expect(submitAnswer(started(), 'nobody', correct, T0 + 1000)).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects an answer outside the question phase', () => {
    expect(submitAnswer(lobbyWith(quiz, 'Олена'), 'p1', correct, T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('locking', () => {
  it('locks automatically once every connected player has answered', () => {
    const afterFirst = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    const state = must(submitAnswer(afterFirst, 'p2', wrong, T0 + 4000));
    expect(state.phase).toBe('locked');
    expect(state.endsAt).toBeNull();
    expect(scores(state)).toEqual([
      [750, 10_000],
      [0, 4000],
    ]);
  });

  it('tick locks at the deadline and not before', () => {
    expect(tick(started(), T0 + 19_999).phase).toBe('question');
    expect(tick(started(), T0 + 20_000).phase).toBe('locked');
  });

  it('counts the full time limit for a player who did not answer', () => {
    const state = tick(must(submitAnswer(started(), 'p1', correct, T0 + 5000)), T0 + 20_000);
    expect(scores(state)).toEqual([
      [875, 5000],
      [0, 20_000],
    ]);
  });

  it('lets the host lock early', () => {
    expect(must(lock(started())).phase).toBe('locked');
    expect(lock(lobbyWith(quiz, 'Олена'))).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('locks when the last player who has not answered disconnects', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(must(setConnected(state, 'p2', false)).phase).toBe('locked');
  });

  it('locks when the last player who has not answered is removed', () => {
    const state = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    expect(must(removePlayer(state, 'p2')).phase).toBe('locked');
  });

  it('keeps waiting for the timer when everyone disconnects without answering', () => {
    const state = must(setConnected(must(setConnected(started(), 'p1', false)), 'p2', false));
    expect(state.phase).toBe('question');
  });
});

describe('next', () => {
  const bothAnswered = () =>
    must(submitAnswer(must(submitAnswer(started(), 'p1', correct, T0 + 1000)), 'p2', wrong, T0 + 1000));

  it('walks locked → reveal → leaderboard → next question → finished', () => {
    const reveal = must(next(bothAnswered(), T0 + 30_000));
    expect(reveal.phase).toBe('reveal');

    const leaderboard = must(next(reveal, T0 + 40_000));
    expect(leaderboard.phase).toBe('leaderboard');

    const second = must(next(leaderboard, T0 + 50_000));
    expect(second.phase).toBe('question');
    expect(second.questionIndex).toBe(1);
    expect(second.endsAt).toBe(T0 + 70_000);
    expect(second.presented).toEqual([]);

    const lastReveal = must(next(must(lock(second)), T0 + 80_000));
    expect(lastReveal.phase).toBe('reveal');

    const finished = must(next(lastReveal, T0 + 90_000));
    expect(finished.phase).toBe('finished');
    expect(next(finished, T0 + 100_000)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('skips the leaderboard when it is shown only at the end', () => {
    const atEnd = makeQuiz([single, text], { leaderboard: 'end' });
    const locked = must(lock(must(start(lobbyWith(atEnd, 'Олена'), T0))));
    const reveal = must(next(locked, T0));
    const second = must(next(reveal, T0 + 1000));
    expect(second.phase).toBe('question');
    expect(second.questionIndex).toBe(1);
  });

  it('is not allowed while a question is open', () => {
    expect(next(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('presented order', () => {
  it('never shows order items in the correct order', () => {
    const identity = () => 0.999;
    const state = must(start(lobbyWith(makeQuiz([order]), 'Олена'), T0, identity));
    expect(state.presented).toEqual(['l', 'k', 'h', 'u']);
  });

  it('shuffles options when the quiz asks for it', () => {
    const shuffled = makeQuiz([single], { shuffleOptions: true });
    const state = must(start(lobbyWith(shuffled, 'Олена'), T0, () => 0));
    expect(state.presented).toEqual(['b', 'c', 'a']);
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run packages/engine/src/game.flow.test.ts`
Expected: FAIL, бо `start`, `submitAnswer`, `lock`, `tick`, `next` не експортуються.

- [ ] **Step 3: Написати реалізацію**

У `packages/engine/src/game.ts` замінити рядки імпорту на початку файла:

```ts
import { LIMITS, type Answer, type ErrorCode, type Phase, type Question, type Quiz } from '@quiz/shared';
import { checkAnswer } from './check';
import { normalizeText } from './normalize';
import { scorePoints, speedFactor } from './score';
```

Замінити функції `removePlayer` і `setConnected` цілком:

```ts
export function removePlayer(state: GameState, playerId: string): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const answers = state.answers.map((byPlayer) => {
    const { [playerId]: _removed, ...rest } = byPlayer;
    return rest;
  });
  return ok(autoLock({ ...state, players: state.players.filter((p) => p.id !== playerId), answers }));
}

export function setConnected(state: GameState, playerId: string, connected: boolean): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const players = state.players.map((p) => (p.id === playerId ? { ...p, connected } : p));
  return ok(autoLock({ ...state, players }));
}
```

Додати в кінець файла:

```ts
export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function present(question: Question, shuffleOptions: boolean, rng: Rng): string[] {
  if (question.type === 'order') {
    const ids = question.items.map((item) => item.id);
    const mixed = shuffle(ids, rng);
    // Гравець не повинен отримати готову правильну відповідь.
    return mixed.every((id, index) => id === ids[index]) ? [...ids.slice(1), ids[0]] : mixed;
  }
  if (question.type === 'single' || question.type === 'multi') {
    const ids = question.options.map((option) => option.id);
    return shuffleOptions ? shuffle(ids, rng) : ids;
  }
  return [];
}

function openQuestion(state: GameState, index: number, now: number, rng: Rng): GameState {
  const question = state.quiz.questions[index];
  return {
    ...state,
    phase: 'question',
    questionIndex: index,
    presented: present(question, state.quiz.settings.shuffleOptions, rng),
    startedAt: now,
    endsAt: now + question.timeLimit * 1000,
    remainingMs: null,
  };
}

/** Перераховує рахунок і сумарний час за всіма вже закритими запитаннями. */
function withTotals(state: GameState): GameState {
  const open = state.phase === 'lobby' || state.phase === 'question';
  const lastClosed = open ? state.questionIndex - 1 : state.questionIndex;
  const players = state.players.map((player) => {
    let score = 0;
    let totalTimeMs = 0;
    for (let index = 0; index <= lastClosed; index++) {
      const record = recordOf(state, index, player.id);
      score += record ? record.points : 0;
      totalTimeMs += record ? record.timeMs : state.quiz.questions[index].timeLimit * 1000;
    }
    return { ...player, score, totalTimeMs };
  });
  return { ...state, players };
}

function lockNow(state: GameState): GameState {
  return withTotals({ ...state, phase: 'locked', startedAt: null, endsAt: null, remainingMs: null });
}

/** Закриває запитання, якщо відповіли всі підключені гравці. */
function autoLock(state: GameState): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  const connected = state.players.filter((p) => p.connected);
  if (connected.length === 0) return state;
  const everyoneAnswered = connected.every((p) => recordOf(state, state.questionIndex, p.id) !== undefined);
  return everyoneAnswered ? lockNow(state) : state;
}

export function start(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.phase !== 'lobby') return fail('wrong_phase');
  if (state.players.length === 0) return fail('no_players');
  return ok(openQuestion(state, 0, now, rng));
}

export function submitAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || state.endsAt === null || now > state.endsAt) return fail('time_over');

  const question = state.quiz.questions[state.questionIndex];
  if (question.type !== answer.type) return fail('type_mismatch');

  const timeMs = Math.max(0, now - state.startedAt);
  const { accepted, accuracy } = checkAnswer(question, answer);
  const speed = speedFactor(timeMs, question.timeLimit * 1000, state.quiz.settings.speedBonus);
  const record: AnswerRecord = {
    answer,
    timeMs,
    accepted,
    accuracy,
    points: scorePoints(question.points, accuracy, speed),
    overridden: false,
  };
  const answers = state.answers.map((byPlayer, index) =>
    index === state.questionIndex ? { ...byPlayer, [playerId]: record } : byPlayer,
  );
  return ok(autoLock({ ...state, answers }));
}

export function lock(state: GameState): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  return ok(lockNow(state));
}

/** Сервер викликає періодично; закриває запитання, коли сплив час. */
export function tick(state: GameState, now: number): GameState {
  const expired = state.phase === 'question' && !state.paused && state.endsAt !== null && now >= state.endsAt;
  return expired ? lockNow(state) : state;
}

export function next(state: GameState, now: number, rng: Rng = Math.random): Result {
  if (state.paused) return fail('paused');
  const isLast = state.questionIndex === state.quiz.questions.length - 1;
  switch (state.phase) {
    case 'locked':
      return ok({ ...state, phase: 'reveal' });
    case 'reveal':
      if (isLast) return ok({ ...state, phase: 'finished' });
      if (state.quiz.settings.leaderboard === 'each') return ok({ ...state, phase: 'leaderboard' });
      return ok(openQuestion(state, state.questionIndex + 1, now, rng));
    case 'leaderboard':
      return ok(openQuestion(state, state.questionIndex + 1, now, rng));
    default:
      return fail('wrong_phase');
  }
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 60 тестів (37 попередніх + 23 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): add game flow with answers, locking and phase transitions"
```

---

### Task 6: Пауза, ручна зміна оцінки, дострокове завершення

**Files:**
- Modify: `packages/engine/src/game.ts` (додати функції в кінець)
- Test: `packages/engine/src/game.control.test.ts`

**Interfaces:**
- Consumes: `GameState`, `Result`, `ok`, `fail`, `recordOf`, `autoLock`, `withTotals` (завдання 4, 5); `scorePoints`, `speedFactor`.
- Produces:
  - `pause(state: GameState, now: number): Result`
  - `resume(state: GameState, now: number): Result`
  - `override(state: GameState, playerId: string, accepted: boolean): Result`
  - `end(state: GameState): Result`

`override` працює для будь-якого типу запитання; інтерфейс пульта показуватиме його лише для текстових (план 3).

- [ ] **Step 1: Написати тест, що падає**

`packages/engine/src/game.control.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { end, lock, next, override, pause, recordOf, resume, start, submitAnswer, tick } from './game';
import { makeQuiz, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';

const T0 = 1_000_000;
const correct = { type: 'single', optionId: 'b' } as const;
const started = () => must(start(lobbyWith(makeQuiz([single, text]), 'Олена', 'Тарас'), T0));

describe('pause and resume', () => {
  it('freezes the remaining time of an open question', () => {
    const paused = must(pause(started(), T0 + 5000));
    expect(paused.paused).toBe(true);
    expect(paused.remainingMs).toBe(15_000);
    expect(paused.endsAt).toBeNull();
  });

  it('refuses answers and ignores the timer while paused', () => {
    const paused = must(pause(started(), T0 + 5000));
    expect(submitAnswer(paused, 'p1', correct, T0 + 6000)).toEqual({ ok: false, error: 'paused' });
    expect(tick(paused, T0 + 999_999).phase).toBe('question');
  });

  it('continues with the same remaining time and the same elapsed time', () => {
    const resumed = must(resume(must(pause(started(), T0 + 5000)), T0 + 60_000));
    expect(resumed.paused).toBe(false);
    expect(resumed.endsAt).toBe(T0 + 75_000);

    const answered = must(submitAnswer(resumed, 'p1', correct, T0 + 61_000));
    expect(recordOf(answered, 0, 'p1')?.timeMs).toBe(6000);
    expect(recordOf(answered, 0, 'p1')?.points).toBe(850);
  });

  it('locks on resume if everyone still connected has already answered', () => {
    const answered = must(submitAnswer(started(), 'p1', correct, T0 + 1000));
    const paused = must(pause(answered, T0 + 2000));
    const offline = { ...paused, players: paused.players.map((p) => (p.id === 'p2' ? { ...p, connected: false } : p)) };
    expect(must(resume(offline, T0 + 9000)).phase).toBe('locked');
  });

  it('blocks next while paused outside a question', () => {
    const paused = must(pause(must(lock(started())), T0));
    expect(paused.remainingMs).toBeNull();
    expect(next(paused, T0)).toEqual({ ok: false, error: 'paused' });
    expect(must(next(must(resume(paused, T0)), T0)).phase).toBe('reveal');
  });

  it('is rejected in the lobby, when already paused, and resume when not paused', () => {
    const lobby = lobbyWith(makeQuiz([single]), 'Олена');
    expect(pause(lobby, T0)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(pause(must(pause(started(), T0)), T0)).toEqual({ ok: false, error: 'paused' });
    expect(resume(started(), T0)).toEqual({ ok: false, error: 'wrong_phase' });
  });
});

describe('override', () => {
  const textQuiz = makeQuiz([text]);
  const onReveal = () => {
    const open = must(start(lobbyWith(textQuiz, 'Олена', 'Тарас'), T0));
    const first = must(submitAnswer(open, 'p1', { type: 'text', value: 'одеса' }, T0 + 10_000));
    const locked = must(submitAnswer(first, 'p2', { type: 'text', value: 'Адеса' }, T0 + 10_000));
    return must(next(locked, T0 + 20_000));
  };

  it('accepts a rejected answer and recalculates points with the original time', () => {
    const state = must(override(onReveal(), 'p2', true));
    expect(recordOf(state, 0, 'p2')).toMatchObject({ accepted: true, accuracy: 1, points: 750, overridden: true });
    expect(state.players.map((p) => p.score)).toEqual([750, 750]);
  });

  it('rejects an accepted answer and removes its points', () => {
    const state = must(override(onReveal(), 'p1', false));
    expect(recordOf(state, 0, 'p1')).toMatchObject({ accepted: false, accuracy: 0, points: 0, overridden: true });
    expect(state.players.map((p) => p.score)).toEqual([0, 0]);
  });

  it('is allowed only on reveal', () => {
    const locked = must(lock(must(start(lobbyWith(textQuiz, 'Олена'), T0))));
    expect(override(locked, 'p1', true)).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('reports a player who gave no answer', () => {
    const reveal = must(next(must(lock(must(start(lobbyWith(textQuiz, 'Олена'), T0)))), T0));
    expect(override(reveal, 'p1', true)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('end', () => {
  it('finishes the game from an open question and counts it as closed', () => {
    const answered = must(submitAnswer(started(), 'p1', correct, T0 + 10_000));
    const finished = must(end(answered));
    expect(finished.phase).toBe('finished');
    expect(finished.endsAt).toBeNull();
    expect(finished.players.map((p) => [p.score, p.totalTimeMs])).toEqual([
      [750, 10_000],
      [0, 20_000],
    ]);
  });

  it('clears a pause', () => {
    expect(must(end(must(pause(started(), T0)))).paused).toBe(false);
  });

  it('is rejected in the lobby and after the game has finished', () => {
    expect(end(lobbyWith(makeQuiz([single]), 'Олена'))).toEqual({ ok: false, error: 'wrong_phase' });
    expect(end(must(end(started())))).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm vitest run packages/engine/src/game.control.test.ts`
Expected: FAIL, бо `pause`, `resume`, `override`, `end` не експортуються.

- [ ] **Step 3: Написати реалізацію**

Додати в кінець `packages/engine/src/game.ts`:

```ts
export function pause(state: GameState, now: number): Result {
  if (state.paused) return fail('paused');
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  if (state.phase === 'question' && state.endsAt !== null) {
    const remainingMs = Math.max(0, state.endsAt - now);
    return ok({ ...state, paused: true, remainingMs, startedAt: null, endsAt: null });
  }
  return ok({ ...state, paused: true });
}

export function resume(state: GameState, now: number): Result {
  if (!state.paused) return fail('wrong_phase');
  if (state.phase === 'question' && state.remainingMs !== null) {
    const limitMs = state.quiz.questions[state.questionIndex].timeLimit * 1000;
    const endsAt = now + state.remainingMs;
    // startedAt зсувається так, щоб час відповіді не включав паузу.
    return ok(autoLock({ ...state, paused: false, remainingMs: null, endsAt, startedAt: endsAt - limitMs }));
  }
  return ok({ ...state, paused: false });
}

/** Ведучий вручну зараховує або відхиляє відповідь на поточне запитання. */
export function override(state: GameState, playerId: string, accepted: boolean): Result {
  if (state.phase !== 'reveal') return fail('wrong_phase');
  const record = recordOf(state, state.questionIndex, playerId);
  if (record === undefined) return fail('not_found');

  const question = state.quiz.questions[state.questionIndex];
  const accuracy = accepted ? 1 : 0;
  const speed = speedFactor(record.timeMs, question.timeLimit * 1000, state.quiz.settings.speedBonus);
  const updated: AnswerRecord = {
    ...record,
    accepted,
    accuracy,
    points: scorePoints(question.points, accuracy, speed),
    overridden: true,
  };
  const answers = state.answers.map((byPlayer, index) =>
    index === state.questionIndex ? { ...byPlayer, [playerId]: updated } : byPlayer,
  );
  return ok(withTotals({ ...state, answers }));
}

export function end(state: GameState): Result {
  if (state.phase === 'lobby' || state.phase === 'finished') return fail('wrong_phase');
  return ok(
    withTotals({ ...state, phase: 'finished', paused: false, startedAt: null, endsAt: null, remainingMs: null }),
  );
}
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 73 тести (60 попередніх + 13 нових).

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): add pause, manual override and early end"
```

---

### Task 7: Зрізи стану за ролями

**Files:**
- Create: `packages/shared/src/views.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/engine/src/views.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/views.test.ts`

**Interfaces:**
- Consumes: `GameState`, `recordOf` (завдання 4); `rankPlayers` (завдання 3); `Question`, `Answer`, `Phase`, `Standing`.
- Produces:
  - у `@quiz/shared`: `Choice`, `PublicQuestion`, `RevealStats`, `LobbyPlayer`, `PlayerResult`, `HostResponse`, `StageView`, `PlayerView`, `HostView`, `GameView`
  - `stageView(state: GameState): StageView`
  - `playerView(state: GameState, playerId: string): PlayerView | null`
  - `hostView(state: GameState): HostView`

Правила видимості:

| Поле | Сцена | Гравець | Ведучий |
|---|---|---|---|
| Правильна відповідь | з етапу `reveal` | з етапу `reveal` | завжди |
| Власний результат запитання | — | з етапу `reveal` | — |
| Рахунок гравця | — | на етапі `locked` без поточного запитання | завжди |
| Рейтинг | `leaderboard`, `finished` | `leaderboard`, `finished` | завжди |
| Відповіді всіх гравців | лише зведена статистика з `reveal` | ні | завжди |

- [ ] **Step 1: Додати типи зрізів**

`packages/shared/src/views.ts`:

```ts
import type { Answer } from './answer';
import type { Phase } from './game';
import type { Question } from './quiz';
import type { Standing } from './standing';

export interface Choice {
  id: string;
  text: string;
}

/** Запитання без правильної відповіді; choices у порядку показу. */
export interface PublicQuestion {
  type: Question['type'];
  text: string;
  imageUrl: string | null;
  timeLimit: number;
  points: number;
  choices: Choice[];
}

export interface RevealStats {
  answered: number;
  accepted: number;
  /** Кількість виборів за id варіанта; для boolean ключі "true" і "false". */
  counts: Record<string, number>;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  connected: boolean;
}

interface BaseView {
  phase: Phase;
  paused: boolean;
  questionIndex: number;
  total: number;
  question: PublicQuestion | null;
  endsAt: number | null;
  remainingMs: number | null;
  playerCount: number;
  answeredCount: number;
}

export interface StageView extends BaseView {
  role: 'stage';
  players: LobbyPlayer[];
  reveal: Question | null;
  stats: RevealStats | null;
  standings: Standing[] | null;
}

export interface PlayerResult {
  accepted: boolean;
  accuracy: number;
  points: number;
}

export interface PlayerView extends BaseView {
  role: 'player';
  me: {
    id: string;
    nickname: string;
    score: number;
    rank: number | null;
    answer: Answer | null;
    result: PlayerResult | null;
  };
  reveal: Question | null;
  standings: Standing[] | null;
}

export interface HostResponse {
  playerId: string;
  nickname: string;
  answer: Answer;
  timeMs: number;
  accepted: boolean;
  points: number;
  overridden: boolean;
}

export interface HostView extends BaseView {
  role: 'host';
  players: (LobbyPlayer & { score: number })[];
  correct: Question | null;
  responses: HostResponse[];
  standings: Standing[];
}

export type GameView = StageView | PlayerView | HostView;
```

`packages/shared/src/index.ts` (повний вміст):

```ts
export * from './quiz';
export * from './answer';
export * from './standing';
export * from './game';
export * from './views';
```

- [ ] **Step 2: Написати тест, що падає**

`packages/engine/src/views.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { next, start, submitAnswer } from './game';
import { makeQuiz, order, single, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const T0 = 1_000_000;
const quiz = makeQuiz([single, text]);
const correct = { type: 'single', optionId: 'b' } as const;
const wrong = { type: 'single', optionId: 'a' } as const;

const lobby = () => lobbyWith(quiz, 'Олена', 'Тарас');
const open = () => must(start(lobby(), T0));
const oneAnswered = () => must(submitAnswer(open(), 'p1', correct, T0 + 10_000));
const locked = () => must(submitAnswer(oneAnswered(), 'p2', wrong, T0 + 10_000));
const reveal = () => must(next(locked(), T0 + 20_000));
const leaderboard = () => must(next(reveal(), T0 + 30_000));

describe('lobby views', () => {
  it('lists players and has no question', () => {
    const view = stageView(lobby());
    expect(view.phase).toBe('lobby');
    expect(view.question).toBeNull();
    expect(view.players).toEqual([
      { id: 'p1', nickname: 'Олена', connected: true },
      { id: 'p2', nickname: 'Тарас', connected: true },
    ]);
    expect(view.playerCount).toBe(2);
    expect(view.total).toBe(2);
  });

  it('returns null for a player who is not in the game', () => {
    expect(playerView(lobby(), 'nobody')).toBeNull();
  });
});

describe('while a question is open', () => {
  it('shows the question with choices and the deadline', () => {
    const view = stageView(oneAnswered());
    expect(view.question).toEqual({
      type: 'single',
      text: 'Столиця України?',
      imageUrl: null,
      timeLimit: 20,
      points: 1000,
      choices: [
        { id: 'a', text: 'Львів' },
        { id: 'b', text: 'Київ' },
        { id: 'c', text: 'Одеса' },
      ],
    });
    expect(view.endsAt).toBe(T0 + 20_000);
    expect(view.answeredCount).toBe(1);
  });

  it('does not leak the correct answer to the stage or to players', () => {
    const state = oneAnswered();
    const stage = stageView(state);
    const player = playerView(state, 'p1');
    expect(JSON.stringify(stage)).not.toContain('correctId');
    expect(JSON.stringify(player)).not.toContain('correctId');
    expect(stage.reveal).toBeNull();
    expect(stage.stats).toBeNull();
    expect(player?.reveal).toBeNull();
  });

  it('shows a player their own answer but not its result', () => {
    const view = playerView(oneAnswered(), 'p1');
    expect(view?.me.answer).toEqual(correct);
    expect(view?.me.result).toBeNull();
    expect(playerView(oneAnswered(), 'p2')?.me.answer).toBeNull();
  });

  it('gives the host the correct answer and live responses', () => {
    const view = hostView(oneAnswered());
    expect(view.correct).toMatchObject({ correctId: 'b' });
    expect(view.responses).toEqual([
      {
        playerId: 'p1',
        nickname: 'Олена',
        answer: correct,
        timeMs: 10_000,
        accepted: true,
        points: 750,
        overridden: false,
      },
    ]);
  });

  it('presents order items in the shuffled order', () => {
    const state = must(start(lobbyWith(makeQuiz([order]), 'Олена'), T0, () => 0.999));
    expect(stageView(state).question?.choices.map((c) => c.id)).toEqual(['l', 'k', 'h', 'u']);
  });

  it('does not leak accepted spellings of a text question', () => {
    const state = must(start(lobbyWith(makeQuiz([text]), 'Олена'), T0));
    expect(JSON.stringify(playerView(state, 'p1'))).not.toContain('Одеса');
    expect(JSON.stringify(stageView(state))).not.toContain('Одеса');
  });
});

describe('after the question is locked', () => {
  it('hides the points of the current question from the player score until reveal', () => {
    expect(playerView(locked(), 'p1')?.me.score).toBe(0);
    expect(playerView(locked(), 'p1')?.me.result).toBeNull();
    expect(JSON.stringify(playerView(locked(), 'p1'))).not.toContain('correctId');
  });

  it('reveals the correct answer, the result and the score', () => {
    const view = playerView(reveal(), 'p1');
    expect(view?.reveal).toMatchObject({ correctId: 'b' });
    expect(view?.me.result).toEqual({ accepted: true, accuracy: 1, points: 750 });
    expect(view?.me.score).toBe(750);
    expect(playerView(reveal(), 'p2')?.me.result).toEqual({ accepted: false, accuracy: 0, points: 0 });
  });

  it('gives the stage answer statistics on reveal', () => {
    expect(stageView(reveal()).stats).toEqual({ answered: 2, accepted: 1, counts: { b: 1, a: 1 } });
  });

  it('ignores unknown option ids in statistics', () => {
    const forged = must(submitAnswer(oneAnswered(), 'p2', { type: 'single', optionId: '__proto__' }, T0 + 10_000));
    const stats = stageView(must(next(forged, T0 + 20_000))).stats;
    expect(Object.keys(stats?.counts ?? {})).toEqual(['b']);
    expect(stats?.answered).toBe(2);
  });
});

describe('standings', () => {
  it('are hidden from stage and players on reveal', () => {
    expect(stageView(reveal()).standings).toBeNull();
    expect(playerView(reveal(), 'p1')?.standings).toBeNull();
    expect(playerView(reveal(), 'p1')?.me.rank).toBeNull();
  });

  it('appear on the leaderboard with the player rank', () => {
    const standings = stageView(leaderboard()).standings;
    expect(standings?.map((s) => [s.nickname, s.score, s.rank])).toEqual([
      ['Олена', 750, 1],
      ['Тарас', 0, 2],
    ]);
    expect(playerView(leaderboard(), 'p2')?.me.rank).toBe(2);
  });

  it('are always available to the host', () => {
    expect(hostView(open()).standings).toHaveLength(2);
    expect(hostView(reveal()).players.map((p) => p.score)).toEqual([750, 0]);
  });
});
```

- [ ] **Step 3: Переконатися, що тест падає**

Run: `pnpm vitest run packages/engine/src/views.test.ts`
Expected: FAIL, бо `./views` не існує.

- [ ] **Step 4: Написати реалізацію**

`packages/engine/src/views.ts`:

```ts
import type {
  Choice,
  HostView,
  Phase,
  PlayerView,
  PublicQuestion,
  Question,
  RevealStats,
  Standing,
  StageView,
} from '@quiz/shared';
import { recordOf, type GameState } from './game';
import { rankPlayers } from './ranking';

const REVEALED: Phase[] = ['reveal', 'leaderboard', 'finished'];
const WITH_STANDINGS: Phase[] = ['leaderboard', 'finished'];

function currentQuestion(state: GameState): Question | null {
  return state.questionIndex >= 0 ? state.quiz.questions[state.questionIndex] : null;
}

function publicQuestion(state: GameState): PublicQuestion | null {
  const question = currentQuestion(state);
  if (question === null) return null;
  const source: Choice[] =
    question.type === 'order'
      ? question.items
      : question.type === 'single' || question.type === 'multi'
        ? question.options
        : [];
  const choices = state.presented
    .map((id) => source.find((choice) => choice.id === id))
    .filter((choice): choice is Choice => choice !== undefined)
    .map((choice) => ({ id: choice.id, text: choice.text }));
  return {
    type: question.type,
    text: question.text,
    imageUrl: question.imageUrl,
    timeLimit: question.timeLimit,
    points: question.points,
    choices,
  };
}

function base(state: GameState) {
  const current = state.answers[state.questionIndex] ?? {};
  return {
    phase: state.phase,
    paused: state.paused,
    questionIndex: state.questionIndex,
    total: state.quiz.questions.length,
    question: publicQuestion(state),
    endsAt: state.endsAt,
    remainingMs: state.remainingMs,
    playerCount: state.players.length,
    answeredCount: Object.keys(current).length,
  };
}

function isRevealed(state: GameState): boolean {
  return state.questionIndex >= 0 && REVEALED.includes(state.phase);
}

function publicStandings(state: GameState): Standing[] | null {
  return WITH_STANDINGS.includes(state.phase) ? rankPlayers(state.players) : null;
}

function revealStats(state: GameState, question: Question): RevealStats {
  const known = new Set<string>(
    question.type === 'single' || question.type === 'multi'
      ? question.options.map((option) => option.id)
      : question.type === 'boolean'
        ? ['true', 'false']
        : [],
  );
  const records = Object.values(state.answers[state.questionIndex] ?? {});
  const counts: Record<string, number> = {};
  for (const { answer } of records) {
    const keys =
      answer.type === 'single'
        ? [answer.optionId]
        : answer.type === 'multi'
          ? [...new Set(answer.optionIds)]
          : answer.type === 'boolean'
            ? [String(answer.value)]
            : [];
    for (const key of keys) {
      if (known.has(key)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return { answered: records.length, accepted: records.filter((r) => r.accepted).length, counts };
}

export function stageView(state: GameState): StageView {
  const revealed = isRevealed(state) ? currentQuestion(state) : null;
  return {
    ...base(state),
    role: 'stage',
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected })),
    reveal: revealed,
    stats: revealed !== null ? revealStats(state, revealed) : null,
    standings: publicStandings(state),
  };
}

export function playerView(state: GameState, playerId: string): PlayerView | null {
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) return null;
  const record = recordOf(state, state.questionIndex, playerId);
  const revealed = isRevealed(state);
  const standings = publicStandings(state);
  // На етапі locked бали за поточне запитання ще не показуємо: це видало б правильність до розкриття.
  const hidden = state.phase === 'locked' && record !== undefined ? record.points : 0;
  return {
    ...base(state),
    role: 'player',
    me: {
      id: player.id,
      nickname: player.nickname,
      score: player.score - hidden,
      rank: standings?.find((s) => s.participantId === player.id)?.rank ?? null,
      answer: record?.answer ?? null,
      result:
        revealed && record !== undefined
          ? { accepted: record.accepted, accuracy: record.accuracy, points: record.points }
          : null,
    },
    reveal: revealed ? currentQuestion(state) : null,
    standings,
  };
}

export function hostView(state: GameState): HostView {
  const responses = state.players.flatMap((player) => {
    const record = recordOf(state, state.questionIndex, player.id);
    if (record === undefined) return [];
    return [
      {
        playerId: player.id,
        nickname: player.nickname,
        answer: record.answer,
        timeMs: record.timeMs,
        accepted: record.accepted,
        points: record.points,
        overridden: record.overridden,
      },
    ];
  });
  return {
    ...base(state),
    role: 'host',
    players: state.players.map((p) => ({ id: p.id, nickname: p.nickname, connected: p.connected, score: p.score })),
    correct: currentQuestion(state),
    responses,
    standings: rankPlayers(state.players),
  };
}
```

`packages/engine/src/index.ts` (повний вміст):

```ts
export * from './normalize';
export * from './check';
export * from './score';
export * from './ranking';
export * from './game';
export * from './views';
```

- [ ] **Step 5: Переконатися, що тести проходять**

Run: `pnpm vitest run packages/engine`
Expected: PASS, 88 тестів (73 попередніх + 15 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 6: Commit**

```bash
git add packages/shared packages/engine
git commit -m "feat(engine): add role-based views of the game state"
```

---

### Task 8: Наскрізний сценарій повної гри

**Files:**
- Test: `packages/engine/src/game.full.test.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: увесь публічний API `@quiz/engine` з попередніх завдань.
- Produces: нічого нового; закріплює поведінку рушія на всіх шести типах запитань разом.

- [ ] **Step 1: Написати тест**

`packages/engine/src/game.full.test.ts`:

```ts
import { expect, it } from 'vitest';
import type { Answer } from '@quiz/shared';
import { next, start, submitAnswer, type GameState } from './game';
import { makeQuiz } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

it('plays a whole quiz with every question type', () => {
  const quiz = makeQuiz(undefined, { speedBonus: false, leaderboard: 'end' });

  // Для кожного запитання: [відповідь Олени, відповідь Тараса, бали Олени, бали Тараса].
  const rounds: [Answer, Answer, number, number][] = [
    [{ type: 'single', optionId: 'b' }, { type: 'single', optionId: 'a' }, 1000, 0],
    [{ type: 'multi', optionIds: ['a', 'c'] }, { type: 'multi', optionIds: ['a'] }, 1000, 0],
    [{ type: 'boolean', value: true }, { type: 'boolean', value: true }, 1000, 1000],
    [{ type: 'text', value: ' ОДЕСА ' }, { type: 'text', value: 'Київ' }, 1000, 0],
    [{ type: 'numeric', value: 2061 }, { type: 'numeric', value: 2111 }, 1000, 750],
    [{ type: 'order', itemIds: ['u', 'l', 'k', 'h'] }, { type: 'order', itemIds: ['l', 'u', 'k', 'h'] }, 1000, 500],
  ];

  let now = 1_000_000;
  let state: GameState = must(start(lobbyWith(quiz, 'Олена', 'Тарас'), now));

  rounds.forEach(([olena, taras, olenaPoints, tarasPoints], index) => {
    expect(state.phase).toBe('question');
    expect(state.questionIndex).toBe(index);

    now += 1000;
    state = must(submitAnswer(state, 'p1', olena, now));
    state = must(submitAnswer(state, 'p2', taras, now));
    expect(state.phase).toBe('locked');

    state = must(next(state, now));
    expect(state.phase).toBe('reveal');
    expect(playerView(state, 'p1')?.me.result?.points).toBe(olenaPoints);
    expect(playerView(state, 'p2')?.me.result?.points).toBe(tarasPoints);
    expect(stageView(state).standings).toBeNull();

    now += 1000;
    state = must(next(state, now));
  });

  expect(state.phase).toBe('finished');
  expect(stageView(state).standings).toEqual([
    { participantId: 'p1', nickname: 'Олена', score: 6000, totalTimeMs: 6000, rank: 1 },
    { participantId: 'p2', nickname: 'Тарас', score: 2250, totalTimeMs: 6000, rank: 2 },
  ]);
  expect(playerView(state, 'p2')?.me.rank).toBe(2);
  expect(hostView(state).standings).toHaveLength(2);
});
```

- [ ] **Step 2: Запустити тест**

Run: `pnpm vitest run packages/engine/src/game.full.test.ts`
Expected: PASS. Якщо тест падає, це помилка в коді попередніх завдань: знайти причину через superpowers:systematic-debugging, а не підганяти очікування.

- [ ] **Step 3: Додати README**

`README.md`:

```markdown
# Quiz

Платформа живих вікторин: ведучий створює вікторину й запускає гру, гравці
приєднуються з телефонів за кодом або QR.

Специфікація: `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`.
Плани реалізації: `docs/superpowers/plans/`.

## Пакети

- `packages/shared`: схеми вікторини, відповідей і зрізів стану (zod + типи).
- `packages/engine`: чиста логіка гри без мережі й бази: перевірка відповідей,
  бали, рейтинг, етапи гри, зрізи стану для сцени, гравця й ведучого.

## Команди

Потрібні Node.js 22+ і pnpm.

    pnpm install
    pnpm test        # усі тести
    pnpm typecheck   # перевірка типів
```

- [ ] **Step 4: Повна перевірка**

Run: `pnpm test`
Expected: PASS, 101 тест (12 у `shared`, 89 в `engine`).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 5: Commit**

```bash
git add packages/engine README.md
git commit -m "test(engine): add full-game scenario covering every question type"
```
