# План 3б: вхід, список вікторин і редактор — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ведучий у браузері реєструється або входить, бачить свої вікторини, створює й редагує їх у редакторі та запускає гру зі збереженої вікторини.

**Architecture:** Нові сторінки `apps/web` спілкуються з API плану 2б через `api.ts`. Логіка чернетки вікторини (нове запитання, зміна типу, перевірка, очищення) винесена в чистий модуль `editor/draft.ts`; `QuizEditor` є компонентом без мережі, що отримує початкову вікторину та `onSave`. Пульт ведучого, не знайшовши токенів на пристрої, просить їх у сервера за сесією.

**Tech Stack:** React 19, React Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Global Constraints

- Усі тексти інтерфейсу в `apps/web/src/i18n.ts`.
- Сторінки, що потребують входу, перенаправляють неавторизованого на `/login`.
- Перед збереженням вікторина перевіряється `quizSchema`; користувач бачить, яке запитання й чому не готове.
- Обмеження зі специфікації: 2–6 варіантів, 3–6 елементів впорядкування, 1–10 написань, час 5–120 с, бали 0–2000, до 100 запитань.
- Оформлення «Нічний ефір»; зони дотику не менші за 44 px.
- Вихід із системи надсилає тіло `{}` (порожнє тіло з типом JSON сервер відхиляє).

## Відхилення (свідомі)

- Анонімний шлях створення гри на сервері лишається до наступного серверного плану; клієнт ним більше не користується, сторінку `/new` прибрано.
- Зображення в запитаннях редактор поки не підтримує (сховища ще немає).

## Review Focus

1. Користувач зберігає вікторину з порожнім варіантом або без тексту запитання: збереження не відбувається, показано номер запитання й причину. Тести в завданнях 2 і 3.
2. Зміна типу запитання не губить уже введений текст запитання, час і бали; між «один варіант» і «кілька варіантів» зберігаються й самі варіанти. Тест у завданні 2.
3. Реєстрація з уже зайнятим email, короткий пароль, неправильний пароль: зрозуміле повідомлення українською, а не код помилки. Тест у завданні 1.
4. Сесія закінчилась, поки відкрито список чи редактор: користувача повертає на вхід, а не показує порожній список. Тест у завданні 4.
5. Ведучий відкрив пульт на іншому пристрої після входу: пульт працює без повторного створення гри. Тест у завданні 4.

---

### Task 1: Запити до API, стан акаунта, сторінка входу

**Files:**
- Modify: `apps/web/src/api.ts` (повна заміна), `apps/web/src/i18n.ts`
- Create: `apps/web/src/useAccount.ts`, `apps/web/src/pages/Login.tsx`
- Test: `apps/web/src/api.test.ts`, `apps/web/src/pages/Login.test.tsx`

**Interfaces:**
- Produces:
  - `type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string }`, `type ApiData<T> = { ok: true; data: T } | { ok: false; error: string }`
  - `interface Account { id: string; name: string; email: string }`, `interface QuizSummary { id; title; description; questionCount; updatedAt }`
  - `me()`, `signUp(name, email, password)`, `signIn(email, password)`, `signOut()`
  - `listQuizzes(): Promise<ApiData<QuizSummary[]>>`, `getQuiz(id): Promise<ApiData<Quiz>>`, `createQuiz(quiz)`, `updateQuiz(id, quiz)`, `deleteQuiz(id)`
  - `createGame(quizId: string)`, `hostAccess(code)`, `checkCode(code)`, `joinGame(code, nickname)`
  - коди помилок входу: `email_taken`, `bad_credentials`, `password_short`, `bad_email`
  - `useAccount(): AccountState`, де `AccountState = { status: 'loading' } | { status: 'anonymous' } | { status: 'signed-in'; account: Account }`
  - сторінка `Login` на `/login`; після успіху перехід на адресу з параметра `next` або `/quizzes`

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteQuiz, listQuizzes, me, signIn, signOut, signUp, updateQuiz } from './api';

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('api', () => {
  it('returns the account fields on success', async () => {
    respond(200, { id: 'u1', name: 'Олена', email: 'o@example.com' });
    expect(await me()).toEqual({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
  });

  it('passes our own error codes through', async () => {
    respond(401, { error: 'unauthorized' });
    expect(await me()).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('translates sign-in and sign-up failures into our codes', async () => {
    respond(422, { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'User already exists.' });
    expect(await signUp('Олена', 'o@example.com', 'password1')).toEqual({ ok: false, error: 'email_taken' });

    respond(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' });
    expect(await signIn('o@example.com', 'nope')).toEqual({ ok: false, error: 'bad_credentials' });

    respond(400, { code: 'PASSWORD_TOO_SHORT', message: 'Password too short' });
    expect(await signUp('Олена', 'o@example.com', '123')).toEqual({ ok: false, error: 'password_short' });

    respond(400, { code: 'INVALID_EMAIL', message: 'Invalid email' });
    expect(await signUp('Олена', 'nope', 'password1')).toEqual({ ok: false, error: 'bad_email' });
  });

  it('reports too many attempts and a lost connection', async () => {
    respond(429, { error: 'Too Many Requests' });
    expect(await signIn('o@example.com', 'password1')).toEqual({ ok: false, error: 'too_many' });

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('failed to fetch'))));
    expect(await me()).toEqual({ ok: false, error: 'offline' });
  });

  it('returns a list as data', async () => {
    const list = [{ id: 'q1', title: 'Гра', description: '', questionCount: 2, updatedAt: '2026-10-12T10:00:00.000Z' }];
    respond(200, list);
    expect(await listQuizzes()).toEqual({ ok: true, data: list });
  });

  it('treats an empty 204 response as success', async () => {
    const fetchMock = respond(204);
    expect(await deleteQuiz('q1')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/quizzes/q1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('sends updates with PUT and sign-out with an empty JSON object', async () => {
    const put = respond(200, { id: 'q1' });
    await updateQuiz('q1', { title: 'Гра', description: '', settings: { speedBonus: true, leaderboard: 'each', shuffleOptions: false }, questions: [] });
    expect(put).toHaveBeenCalledWith('/api/quizzes/q1', expect.objectContaining({ method: 'PUT' }));

    const out = respond(200, { success: true });
    await signOut();
    expect(out).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({ method: 'POST', body: '{}' }));
  });
});
```

`apps/web/src/pages/Login.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn, signUp } from '../api';
import { Login } from './Login';

vi.mock('../api', () => ({ signIn: vi.fn(), signUp: vi.fn() }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const open = (entry = '/login') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/quizzes" element={<p>мої вікторини</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('Login', () => {
  it('signs in and opens the quiz list', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    open();
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith('o@example.com', 'password1');
  });

  it('returns to the page that asked for sign-in', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    open('/login?next=%2Fhost%2F123456');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
  });

  it('ignores a next address that leads to another site', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: true });
    open('/login?next=https%3A%2F%2Fevil.example');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
  });

  it('explains a wrong password in plain words', async () => {
    vi.mocked(signIn).mockResolvedValue({ ok: false, error: 'bad_credentials' });
    open();
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Увійти' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Неправильний email або пароль.');
    expect(screen.queryByText('мої вікторини')).toBeNull();
  });

  it('registers a new host with a name', async () => {
    vi.mocked(signUp).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Створити акаунт' }));
    fill('Ваше ім’я', 'Олена');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Зареєструватися' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(signUp).toHaveBeenCalledWith('Олена', 'o@example.com', 'password1');
  });

  it('explains a taken email and a short password', async () => {
    vi.mocked(signUp).mockResolvedValueOnce({ ok: false, error: 'email_taken' });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Створити акаунт' }));
    fill('Ваше ім’я', 'Олена');
    fill('Email', 'o@example.com');
    fill('Пароль', 'password1');
    fireEvent.click(screen.getByRole('button', { name: 'Зареєструватися' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Акаунт із таким email уже існує. Спробуйте увійти.');

    fill('Пароль', '1234567');
    expect((screen.getByRole('button', { name: 'Зареєструватися' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
```

Run: `pnpm vitest run apps/web/src/api.test.ts apps/web/src/pages/Login.test.tsx`
Expected: FAIL: `me`, `signIn` тощо не експортуються; модуля `./Login` немає.

- [ ] **Step 2: Написати реалізацію**

`apps/web/src/api.ts` (повний вміст):

```ts
import type { Phase, Quiz } from '@quiz/shared';
import type { HostTokens } from './storage';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type ApiData<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Account {
  id: string;
  name: string;
  email: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Коди помилок бібліотеки авторизації, перекладені в наші. */
const AUTH_CODES: [prefix: string, code: string][] = [
  ['USER_ALREADY_EXISTS', 'email_taken'],
  ['INVALID_EMAIL_OR_PASSWORD', 'bad_credentials'],
  ['PASSWORD_TOO_SHORT', 'password_short'],
  ['INVALID_EMAIL', 'bad_email'],
];

function errorCode(data: unknown): string {
  if (typeof data !== 'object' || data === null) return 'unknown';
  const { error, code } = data as Record<string, unknown>;
  if (typeof code === 'string') {
    const known = AUTH_CODES.find(([prefix]) => code.startsWith(prefix));
    if (known !== undefined) return known[1];
  }
  return typeof error === 'string' ? error : 'unknown';
}

async function call(url: string, options: Options): Promise<ApiData<unknown>> {
  const hasBody = options.body !== undefined;
  try {
    const response = await fetch(url, {
      method: options.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
    if (response.status === 429) return { ok: false, error: 'too_many' };
    const data: unknown = response.status === 204 ? {} : await response.json().catch(() => null);
    if (!response.ok || data === null) return { ok: false, error: errorCode(data) };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** Запит, відповідь якого є об'єктом: його поля лежать поруч з ok. */
async function request<T>(url: string, options: Options = {}): Promise<ApiResult<T>> {
  const result = await call(url, options);
  return result.ok ? { ok: true, ...(result.data as T) } : result;
}

/** Запит, відповідь якого потрібна цілою (наприклад, список). */
async function fetchData<T>(url: string, options: Options = {}): Promise<ApiData<T>> {
  const result = await call(url, options);
  return result.ok ? { ok: true, data: result.data as T } : result;
}

const quizUrl = (id: string) => `/api/quizzes/${encodeURIComponent(id)}`;
const gameUrl = (code: string) => `/api/games/by-code/${encodeURIComponent(code)}`;

export const me = () => request<Account>('/api/me');
export const signUp = (name: string, email: string, password: string) =>
  request<object>('/api/auth/sign-up/email', { body: { name, email, password } });
export const signIn = (email: string, password: string) =>
  request<object>('/api/auth/sign-in/email', { body: { email, password } });
// Порожнє тіло з типом JSON сервер відхиляє, тому надсилається порожній об'єкт.
export const signOut = () => request<object>('/api/auth/sign-out', { body: {} });

export const listQuizzes = () => fetchData<QuizSummary[]>('/api/quizzes');
export const getQuiz = (id: string) => fetchData<Quiz>(quizUrl(id));
export const createQuiz = (quiz: Quiz) => request<{ id: string }>('/api/quizzes', { body: quiz });
export const updateQuiz = (id: string, quiz: Quiz) => request<{ id: string }>(quizUrl(id), { method: 'PUT', body: quiz });
export const deleteQuiz = (id: string) => request<object>(quizUrl(id), { method: 'DELETE' });

export const createGame = (quizId: string) =>
  request<{ gameId: string; code: string } & HostTokens>('/api/games', { body: { quizId } });
export const hostAccess = (code: string) => request<HostTokens>(`${gameUrl(code)}/host-access`);
export const checkCode = (code: string) => request<{ phase: Phase; title: string }>(gameUrl(code));
export const joinGame = (code: string, nickname: string) =>
  request<{ token: string; playerId: string }>(`${gameUrl(code)}/join`, { body: { nickname } });
```

`apps/web/src/useAccount.ts`:

```ts
import { useEffect, useState } from 'react';
import { me, type Account } from './api';

export type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'signed-in'; account: Account };

/** Хто зараз увійшов. Запитує сервер один раз під час появи сторінки. */
export function useAccount(): AccountState {
  const [state, setState] = useState<AccountState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    void me().then((result) => {
      if (!current) return;
      setState(
        result.ok
          ? { status: 'signed-in', account: { id: result.id, name: result.name, email: result.email } }
          : { status: 'anonymous' },
      );
    });
    return () => {
      current = false;
    };
  }, []);

  return state;
}
```

`apps/web/src/pages/Login.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signUp } from '../api';
import { errorText, t } from '../i18n';

const MIN_PASSWORD = 8;

/** Адреса повернення має бути шляхом усередині застосунку, а не чужим сайтом. */
function safeNext(next: string | null): string {
  return next !== null && next.startsWith('/') && !next.startsWith('//') ? next : '/quizzes';
}

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    email.trim() !== '' &&
    (registering ? name.trim().length >= 2 && password.length >= MIN_PASSWORD : password !== '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = registering ? await signUp(name.trim(), email.trim(), password) : await signIn(email.trim(), password);
    setBusy(false);
    if (result.ok) navigate(safeNext(params.get('next')), { replace: true });
    else setError(errorText(result.error));
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{t(registering ? 'registerTitle' : 'loginTitle')}</h1>
      <form className="panel" onSubmit={submit}>
        {registering && (
          <label className="field">
            <span>{t('nicknameLabel')}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>{t('emailLabel')}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={200}
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span>{t('passwordLabel')}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={128}
            autoComplete={registering ? 'new-password' : 'current-password'}
            aria-describedby={registering ? 'password-hint' : undefined}
          />
        </label>
        {registering && (
          <p className="meta" id="password-hint">
            {t('passwordHint')}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {t(busy ? 'checking' : registering ? 'registerButton' : 'joinButton')}
        </button>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          setRegistering(!registering);
          setError(null);
        }}
      >
        {t(registering ? 'haveAccount' : 'createAccount')}
      </button>
      <Link className="quiet-link" to="/">
        {t('backHome')}
      </Link>
    </main>
  );
}
```

У `apps/web/src/i18n.ts` перед рядком `  // Помилки` додати:

```ts
  // Акаунт
  loginTitle: 'Вхід для ведучого',
  registerTitle: 'Новий акаунт',
  emailLabel: 'Email',
  passwordLabel: 'Пароль',
  passwordHint: 'Щонайменше 8 символів',
  registerButton: 'Зареєструватися',
  createAccount: 'Створити акаунт',
  haveAccount: 'У мене вже є акаунт',
  backHome: 'На головну',
  signOut: 'Вийти',
  hostEntry: 'Я ведучий',
  // Список вікторин
  quizzesTitle: 'Мої вікторини',
  noQuizzes: 'Тут з’являться ваші вікторини. Створіть першу або додайте приклад.',
  newQuiz: 'Нова вікторина',
  addDemo: 'Додати приклад',
  questionCount: 'Запитань: {count}',
  play: 'Грати',
  edit: 'Редагувати',
  remove: 'Видалити',
  removeConfirm: 'Видалити вікторину «{title}»? Це не можна скасувати.',
  starting: 'Створюємо гру…',
  loading: 'Завантажуємо…',
  // Редактор
  editorNew: 'Нова вікторина',
  editorEdit: 'Редагування вікторини',
  quizTitle: 'Назва вікторини',
  quizDescription: 'Короткий опис (необов’язково)',
  settingsTitle: 'Правила гри',
  speedBonus: 'Бали за швидкість: швидша правильна відповідь дає більше',
  shuffleOptions: 'Перемішувати варіанти відповідей',
  leaderboardLabel: 'Показувати рейтинг',
  leaderboardEach: 'після кожного запитання',
  leaderboardEnd: 'лише в кінці гри',
  questionN: 'Запитання {index}',
  untitled: 'без тексту',
  questionText: 'Текст запитання',
  questionType: 'Тип запитання',
  timeLimit: 'Час, с',
  pointsLabel: 'Бали',
  type_single: 'Один правильний варіант',
  type_multi: 'Кілька правильних варіантів',
  type_boolean: 'Так чи ні',
  type_text: 'Текстова відповідь',
  type_numeric: 'Число',
  type_order: 'Впорядкування',
  optionN: 'Варіант {index}',
  correctOption: 'Правильний: варіант {index}',
  addOption: 'Додати варіант',
  removeOption: 'Прибрати варіант {index}',
  itemN: 'Елемент {index}',
  addItem: 'Додати елемент',
  removeItem: 'Прибрати елемент {index}',
  orderHint: 'Запишіть елементи в правильному порядку. Гравці побачать їх перемішаними.',
  correctIs: 'Правильна відповідь',
  spellingN: 'Написання {index}',
  addSpelling: 'Додати написання',
  removeSpelling: 'Прибрати написання {index}',
  spellingHint: 'Регістр і зайві пробіли не враховуються. Під час гри ви зможете зарахувати відповідь вручну.',
  correctNumber: 'Правильне число',
  tolerance: 'Допустиме відхилення',
  toleranceHint: '0 означає лише точну відповідь. Інакше що ближче до числа, то більше балів.',
  moveQuestionUp: 'Перемістити запитання {index} вище',
  moveQuestionDown: 'Перемістити запитання {index} нижче',
  removeQuestion: 'Видалити запитання {index}',
  addQuestion: 'Додати запитання',
  save: 'Зберегти',
  saving: 'Зберігаємо…',
  cancel: 'Скасувати',
  problemTitle: 'Дайте вікторині назву.',
  problemNoText: 'Запитання {index}: впишіть текст запитання.',
  problemEmptyOption: 'Запитання {index}: заповніть усі варіанти або приберіть порожні.',
  problemNoCorrect: 'Запитання {index}: позначте хоча б один правильний варіант.',
  problemNoAccepted: 'Запитання {index}: впишіть правильну відповідь.',
  problemNumber: 'Запитання {index}: впишіть правильне число та відхилення (не менше 0).',
  problemLimits: 'Запитання {index}: час має бути від 5 до 120 секунд, бали від 0 до 2000.',
  problemGeneric: 'Запитання {index}: перевірте заповнення.',
```

І в розділ помилок додати:

```ts
  err_email_taken: 'Акаунт із таким email уже існує. Спробуйте увійти.',
  err_bad_credentials: 'Неправильний email або пароль.',
  err_password_short: 'Пароль закороткий: потрібно щонайменше 8 символів.',
  err_bad_email: 'Перевірте адресу email.',
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm vitest run apps/web/src/api.test.ts apps/web/src/pages/Login.test.tsx`
Expected: PASS, 13 тестів. (Сторінка `NewGame` ще викликає старий `createGame(quiz)`, тому перевірка типів проходить лише після завдання 4.)

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add account API calls and sign-in page"
```

---

### Task 2: Логіка чернетки вікторини

**Files:**
- Create: `apps/web/src/editor/draft.ts`
- Test: `apps/web/src/editor/draft.test.ts`

**Interfaces:**
- Consumes: `LIMITS`, `DEFAULT_SETTINGS`, `questionSchema`, `quizSchema`, типи `Question`, `Quiz` з `@quiz/shared`; `t`.
- Produces:
  - `type QuestionType = Question['type']`, `QUESTION_TYPES: readonly QuestionType[]`
  - `newQuestion(type: QuestionType): Question`
  - `changeType(question: Question, type: QuestionType): Question`
  - `newQuiz(): Quiz`
  - `cleaned(quiz: Quiz): Quiz` (обрізає пробіли, викидає порожні написання)
  - `problemsOf(quiz: Quiz): string[]` (порожній список означає, що вікторину можна зберігати)

- [ ] **Step 1: Написати тест, що падає**

`apps/web/src/editor/draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { quizSchema, type Question, type Quiz } from '@quiz/shared';
import { QUESTION_TYPES, changeType, cleaned, newQuestion, newQuiz, problemsOf } from './draft';

/** Заповнює порожні поля нового запитання так, як це зробив би користувач. */
function filled(question: Question): Question {
  const text = 'Запитання?';
  switch (question.type) {
    case 'single':
    case 'multi':
      return { ...question, text, options: question.options.map((o, i) => ({ ...o, text: `Варіант ${i + 1}` })) };
    case 'order':
      return { ...question, text, items: question.items.map((o, i) => ({ ...o, text: `Елемент ${i + 1}` })) };
    case 'text':
      return { ...question, text, accepted: ['Відповідь'] };
    default:
      return { ...question, text };
  }
}

const quizWith = (...questions: Question[]): Quiz => ({ ...newQuiz(), title: 'Гра', questions });

describe('newQuestion', () => {
  it('creates a question of every type that becomes valid once its texts are filled in', () => {
    for (const type of QUESTION_TYPES) {
      const quiz = quizWith(filled(newQuestion(type)));
      expect(problemsOf(quiz), type).toEqual([]);
      expect(quizSchema.safeParse(cleaned(quiz)).success, type).toBe(true);
    }
  });

  it('uses the default time and points and unique ids', () => {
    const first = newQuestion('single');
    const second = newQuestion('single');
    expect(first.timeLimit).toBe(20);
    expect(first.points).toBe(1000);
    expect(first.id).not.toBe(second.id);
    if (first.type === 'single') expect(new Set(first.options.map((o) => o.id)).size).toBe(first.options.length);
  });
});

describe('changeType', () => {
  it('keeps the question text, time and points', () => {
    const source = { ...newQuestion('single'), text: 'Скільки?', timeLimit: 45, points: 500 };
    for (const type of QUESTION_TYPES) {
      const changed = changeType(source, type);
      expect(changed.type).toBe(type);
      expect([changed.id, changed.text, changed.timeLimit, changed.points]).toEqual([source.id, 'Скільки?', 45, 500]);
    }
  });

  it('keeps the options and the correct one between single and multi choice', () => {
    const single = filled(newQuestion('single'));
    if (single.type !== 'single') throw new Error('unexpected type');
    const picked = { ...single, correctId: single.options[1].id };

    const multi = changeType(picked, 'multi');
    if (multi.type !== 'multi') throw new Error('unexpected type');
    expect(multi.options).toEqual(picked.options);
    expect(multi.correctIds).toEqual([picked.options[1].id]);

    const back = changeType({ ...multi, correctIds: [multi.options[1].id, multi.options[0].id] }, 'single');
    if (back.type !== 'single') throw new Error('unexpected type');
    expect(back.options).toEqual(picked.options);
    expect(back.correctId).toBe(multi.options[0].id);
  });

  it('returns the same question when the type does not change', () => {
    const question = filled(newQuestion('text'));
    expect(changeType(question, 'text')).toBe(question);
  });
});

describe('problemsOf', () => {
  it('asks for a title', () => {
    expect(problemsOf({ ...quizWith(filled(newQuestion('boolean'))), title: '  ' })).toEqual(['Дайте вікторині назву.']);
  });

  it('names the question and the reason', () => {
    const noText = newQuestion('boolean');
    const emptyOption = { ...filled(newQuestion('single')) };
    if (emptyOption.type === 'single') emptyOption.options = [emptyOption.options[0], { ...emptyOption.options[1], text: ' ' }];
    const noCorrect = { ...filled(newQuestion('multi')), correctIds: [] };
    const noAccepted = { ...filled(newQuestion('text')), accepted: ['  ', ''] };
    const badNumber = { ...filled(newQuestion('numeric')), correct: Number.NaN };
    const badTolerance = { ...filled(newQuestion('numeric')), tolerance: -1 };
    const badLimits = { ...filled(newQuestion('boolean')), timeLimit: 3 };
    const emptyItem = filled(newQuestion('order'));
    if (emptyItem.type === 'order') emptyItem.items = emptyItem.items.map((item, i) => (i === 2 ? { ...item, text: '' } : item));

    expect(
      problemsOf(quizWith(noText, emptyOption, noCorrect as Question, noAccepted, badNumber, badTolerance, badLimits, emptyItem)),
    ).toEqual([
      'Запитання 1: впишіть текст запитання.',
      'Запитання 2: заповніть усі варіанти або приберіть порожні.',
      'Запитання 3: позначте хоча б один правильний варіант.',
      'Запитання 4: впишіть правильну відповідь.',
      'Запитання 5: впишіть правильне число та відхилення (не менше 0).',
      'Запитання 6: впишіть правильне число та відхилення (не менше 0).',
      'Запитання 7: час має бути від 5 до 120 секунд, бали від 0 до 2000.',
      'Запитання 8: заповніть усі варіанти або приберіть порожні.',
    ]);
  });

  it('never lets through a quiz the server would refuse', () => {
    const duplicateText = filled(newQuestion('single'));
    const tooLong = { ...filled(newQuestion('boolean')), text: 'я'.repeat(301) };
    for (const question of [duplicateText, tooLong]) {
      const quiz = quizWith(question);
      const accepted = quizSchema.safeParse(cleaned(quiz)).success;
      expect(problemsOf(quiz).length === 0).toBe(accepted);
    }
  });
});

describe('cleaned', () => {
  it('trims texts and drops blank spellings', () => {
    const question = { ...filled(newQuestion('text')), text: '  Місто?  ', accepted: [' Одеса ', '', '  '] };
    const result = cleaned({ ...quizWith(question), title: '  Гра  ', description: '  опис ' });
    expect(result.title).toBe('Гра');
    expect(result.description).toBe('опис');
    expect(result.questions[0]).toMatchObject({ text: 'Місто?', accepted: ['Одеса'] });
  });
});
```

Run: `pnpm vitest run apps/web/src/editor`
Expected: FAIL, модуль `./draft` не існує.

- [ ] **Step 2: Написати реалізацію**

`apps/web/src/editor/draft.ts`:

```ts
import { DEFAULT_SETTINGS, LIMITS, questionSchema, quizSchema, type Question, type Quiz } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

export type QuestionType = Question['type'];
export const QUESTION_TYPES = ['single', 'multi', 'boolean', 'text', 'numeric', 'order'] as const;

type Common = Pick<Question, 'id' | 'text' | 'imageUrl' | 'timeLimit' | 'points'>;

const newId = () => crypto.randomUUID();
const blanks = (count: number) => Array.from({ length: count }, () => ({ id: newId(), text: '' }));

function build(common: Common, type: QuestionType): Question {
  switch (type) {
    case 'single': {
      const options = blanks(LIMITS.minOptions);
      return { ...common, type, options, correctId: options[0].id };
    }
    case 'multi': {
      const options = blanks(LIMITS.minOptions);
      return { ...common, type, options, correctIds: [options[0].id] };
    }
    case 'boolean':
      return { ...common, type, correct: true };
    case 'text':
      return { ...common, type, accepted: [''] };
    case 'numeric':
      return { ...common, type, correct: 0, tolerance: 0 };
    case 'order':
      return { ...common, type, items: blanks(LIMITS.minOrderItems) };
  }
}

export function newQuestion(type: QuestionType): Question {
  return build(
    { id: newId(), text: '', imageUrl: null, timeLimit: LIMITS.defaultTime, points: LIMITS.defaultPoints },
    type,
  );
}

/** Змінює тип, зберігаючи текст, час і бали; між single і multi зберігаються й варіанти. */
export function changeType(question: Question, type: QuestionType): Question {
  if (question.type === type) return question;
  const { id, text, imageUrl, timeLimit, points } = question;
  const common: Common = { id, text, imageUrl, timeLimit, points };

  if (question.type === 'single' && type === 'multi') {
    return { ...common, type, options: question.options, correctIds: [question.correctId] };
  }
  if (question.type === 'multi' && type === 'single') {
    const firstCorrect = question.options.find((option) => question.correctIds.includes(option.id));
    return { ...common, type, options: question.options, correctId: (firstCorrect ?? question.options[0]).id };
  }
  return build(common, type);
}

export function newQuiz(): Quiz {
  return { title: '', description: '', settings: { ...DEFAULT_SETTINGS }, questions: [newQuestion('single')] };
}

/** Вікторина в тому вигляді, у якому вона піде на сервер. */
export function cleaned(quiz: Quiz): Quiz {
  const trimAll = <T extends { text: string }>(items: T[]) => items.map((item) => ({ ...item, text: item.text.trim() }));
  return {
    ...quiz,
    title: quiz.title.trim(),
    description: quiz.description.trim(),
    questions: quiz.questions.map((question): Question => {
      const text = question.text.trim();
      switch (question.type) {
        case 'single':
        case 'multi':
          return { ...question, text, options: trimAll(question.options) };
        case 'order':
          return { ...question, text, items: trimAll(question.items) };
        case 'text':
          return { ...question, text, accepted: question.accepted.map((s) => s.trim()).filter((s) => s !== '') };
        default:
          return { ...question, text };
      }
    }),
  };
}

function problemKey(question: Question): TextKey | null {
  if (question.text === '') return 'problemNoText';
  const { timeLimit, points } = question;
  const inLimits =
    Number.isInteger(timeLimit) &&
    timeLimit >= LIMITS.minTime &&
    timeLimit <= LIMITS.maxTime &&
    Number.isInteger(points) &&
    points >= 0 &&
    points <= LIMITS.maxPoints;
  if (!inLimits) return 'problemLimits';

  switch (question.type) {
    case 'single':
    case 'multi':
      if (question.options.some((option) => option.text === '')) return 'problemEmptyOption';
      if (question.type === 'multi' && question.correctIds.length === 0) return 'problemNoCorrect';
      break;
    case 'order':
      if (question.items.some((item) => item.text === '')) return 'problemEmptyOption';
      break;
    case 'text':
      if (question.accepted.length === 0) return 'problemNoAccepted';
      break;
    case 'numeric':
      if (!Number.isFinite(question.correct) || !Number.isFinite(question.tolerance) || question.tolerance < 0) {
        return 'problemNumber';
      }
      break;
    case 'boolean':
      break;
  }
  return questionSchema.safeParse(question).success ? null : 'problemGeneric';
}

/** Що заважає зберегти вікторину; порожній список означає, що все гаразд. */
export function problemsOf(quiz: Quiz): string[] {
  const draft = cleaned(quiz);
  const problems: string[] = [];
  if (draft.title === '') problems.push(t('problemTitle'));
  draft.questions.forEach((question, index) => {
    const key = problemKey(question);
    if (key !== null) problems.push(t(key, { index: index + 1 }));
  });
  // Остання перевірка тією самою схемою, що й на сервері.
  if (problems.length === 0 && !quizSchema.safeParse(draft).success) problems.push(t('problemGeneric', { index: 1 }));
  return problems;
}
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm vitest run apps/web/src/editor`
Expected: PASS, 9 тестів.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add quiz draft logic for the editor"
```

---

### Task 3: Редактор вікторини

**Files:**
- Create: `apps/web/src/editor/QuestionEditor.tsx`, `apps/web/src/editor/QuizEditor.tsx`
- Test: `apps/web/src/editor/QuizEditor.test.tsx`

**Interfaces:**
- Consumes: `draft.ts` (завдання 2), `t`.
- Produces:
  - `<QuestionEditor question index onChange />`
  - `<QuizEditor initial heading onSave onCancel />`, де `onSave: (quiz: Quiz) => Promise<string | null>` повертає текст помилки або `null`

Одночасно розгорнуте одне запитання; решта показані рядком із номером і початком тексту.

- [ ] **Step 1: Написати тест, що падає**

`apps/web/src/editor/QuizEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quizSchema, type Quiz } from '@quiz/shared';
import { newQuiz } from './draft';
import { QuizEditor } from './QuizEditor';

afterEach(cleanup);

function open(initial: Quiz = newQuiz(), result: string | null = null) {
  const onSave = vi.fn(async (_quiz: Quiz) => result);
  const onCancel = vi.fn();
  render(<QuizEditor initial={initial} heading="Нова вікторина" onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const saved = (onSave: ReturnType<typeof open>['onSave']) => onSave.mock.calls[0][0];

describe('QuizEditor', () => {
  it('saves a quiz with a single-choice question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Географія');
    fill('Текст запитання', 'Столиця України?');
    fill('Варіант 1', 'Львів');
    fill('Варіант 2', 'Київ');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 2'));
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(quiz.title).toBe('Географія');
    const [question] = quiz.questions;
    expect(question).toMatchObject({ type: 'single', text: 'Столиця України?' });
    if (question.type === 'single') {
      expect(question.options.map((o) => o.text)).toEqual(['Львів', 'Київ']);
      expect(question.correctId).toBe(question.options[1].id);
    }
  });

  it('does not save an unfinished quiz and says what is missing', () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Географія');
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Запитання 1: впишіть текст запитання.');
  });

  it('shows an error returned by the save', async () => {
    open(undefined, 'Немає зв’язку із сервером.');
    fill('Назва вікторини', 'Географія');
    fill('Текст запитання', 'Говерла найвища?');
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    click('Зберегти');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
  });

  it('adds and removes options within the limits', () => {
    open();
    for (let i = 0; i < 4; i++) click('Додати варіант');
    expect(screen.getByLabelText('Варіант 6')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Додати варіант' }) as HTMLButtonElement).disabled).toBe(true);

    click('Прибрати варіант 6');
    expect(screen.queryByLabelText('Варіант 6')).toBeNull();
    for (const n of [5, 4, 3]) click(`Прибрати варіант ${n}`);
    expect((screen.getByRole('button', { name: 'Прибрати варіант 2' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a correct option when the marked one is removed', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що?');
    click('Додати варіант');
    fill('Варіант 1', 'А');
    fill('Варіант 2', 'Б');
    fill('Варіант 3', 'В');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 3'));
    click('Прибрати варіант 3');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [question] = saved(onSave).questions;
    if (question.type === 'single') expect(question.options.map((o) => o.id)).toContain(question.correctId);
  });

  it('switches the fields with the question type and keeps the text', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Яка висота Говерли?');
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'numeric' } });
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Яка висота Говерли?');
    expect(screen.queryByLabelText('Варіант 1')).toBeNull();

    fill('Правильне число', '2061');
    fill('Допустиме відхилення', '100');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).questions[0]).toMatchObject({ type: 'numeric', correct: 2061, tolerance: 100 });
  });

  it('edits a text question with several spellings and an order question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Місто із замком Паланок?');
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'text' } });
    fill('Написання 1', 'Мукачево');
    click('Додати написання');
    fill('Написання 2', 'Мукачеве');

    click('Додати запитання');
    fill('Текст запитання', 'Із заходу на схід');
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'order' } });
    fill('Елемент 1', 'Львів');
    fill('Елемент 2', 'Київ');
    fill('Елемент 3', 'Харків');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [first, second] = saved(onSave).questions;
    expect(first).toMatchObject({ type: 'text', accepted: ['Мукачево', 'Мукачеве'] });
    expect(second.type === 'order' && second.items.map((i) => i.text)).toEqual(['Львів', 'Київ', 'Харків']);
  });

  it('adds, reorders and removes questions but never the last one', () => {
    open();
    expect((screen.getByRole('button', { name: 'Видалити запитання 1' }) as HTMLButtonElement).disabled).toBe(true);
    fill('Текст запитання', 'Перше');
    click('Додати запитання');
    fill('Текст запитання', 'Друге');

    click('Перемістити запитання 2 вище');
    expect(screen.getByRole('button', { name: /Запитання 2.*Перше/ })).toBeTruthy();
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Друге');

    click('Видалити запитання 1');
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Перше');
    expect(screen.queryByRole('button', { name: /Запитання 2/ })).toBeNull();
  });

  it('changes the game rules', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Так?');
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByLabelText(/Бали за швидкість/));
    fireEvent.click(screen.getByLabelText('Перемішувати варіанти відповідей'));
    fireEvent.change(screen.getByLabelText('Показувати рейтинг'), { target: { value: 'end' } });
    fill('Час, с', '45');
    fill('Бали', '500');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const quiz = saved(onSave);
    expect(quiz.settings).toEqual({ speedBonus: false, leaderboard: 'end', shuffleOptions: true });
    expect(quiz.questions[0]).toMatchObject({ timeLimit: 45, points: 500, correct: true });
  });

  it('opens an existing quiz for editing and cancels', () => {
    const initial: Quiz = { ...newQuiz(), title: 'Стара назва' };
    const { onCancel } = open(initial);
    expect((screen.getByLabelText('Назва вікторини') as HTMLInputElement).value).toBe('Стара назва');
    click('Скасувати');
    expect(onCancel).toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run apps/web/src/editor/QuizEditor.test.tsx`
Expected: FAIL, модуль `./QuizEditor` не існує.

- [ ] **Step 2: Написати реалізацію**

`apps/web/src/editor/QuestionEditor.tsx`:

```tsx
import { LIMITS, type Question } from '@quiz/shared';
import type { ReactNode } from 'react';
import { t, type TextKey } from '../i18n';
import { QUESTION_TYPES, changeType, type QuestionType } from './draft';

interface Props {
  question: Question;
  onChange: (next: Question) => void;
}

interface Row {
  id: string;
  text: string;
}

const newRow = (): Row => ({ id: crypto.randomUUID(), text: '' });
const asNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw.replace(',', '.')));
const shown = (value: number) => (Number.isNaN(value) ? '' : String(value));

/** Список рядків із текстом: варіанти, елементи впорядкування. */
function Rows(props: {
  rows: Row[];
  min: number;
  max: number;
  label: TextKey;
  removeLabel: TextKey;
  addLabel: TextKey;
  mark?: (row: Row, index: number) => ReactNode;
  onChange: (rows: Row[]) => void;
}) {
  const { rows, min, max, onChange } = props;
  return (
    <div className="rows-edit">
      {rows.map((row, index) => (
        <div className="row-edit" key={row.id}>
          {props.mark?.(row, index)}
          <input
            aria-label={t(props.label, { index: index + 1 })}
            placeholder={t(props.label, { index: index + 1 })}
            value={row.text}
            maxLength={LIMITS.optionText}
            onChange={(event) => onChange(rows.map((r) => (r.id === row.id ? { ...r, text: event.target.value } : r)))}
          />
          <button
            type="button"
            className="btn btn-icon"
            aria-label={t(props.removeLabel, { index: index + 1 })}
            disabled={rows.length <= min}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-small" disabled={rows.length >= max} onClick={() => onChange([...rows, newRow()])}>
        {t(props.addLabel)}
      </button>
    </div>
  );
}

function Body({ question, onChange }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <Rows
          rows={question.options}
          min={LIMITS.minOptions}
          max={LIMITS.maxOptions}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          mark={(row, index) => (
            <input
              type="radio"
              name={`correct-${question.id}`}
              aria-label={t('correctOption', { index: index + 1 })}
              checked={question.correctId === row.id}
              onChange={() => onChange({ ...question, correctId: row.id })}
            />
          )}
          onChange={(options) =>
            onChange({
              ...question,
              options,
              // Якщо позначений варіант прибрали, правильним стає перший.
              correctId: options.some((o) => o.id === question.correctId) ? question.correctId : options[0].id,
            })
          }
        />
      );
    case 'multi':
      return (
        <Rows
          rows={question.options}
          min={LIMITS.minOptions}
          max={LIMITS.maxOptions}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          mark={(row, index) => (
            <input
              type="checkbox"
              aria-label={t('correctOption', { index: index + 1 })}
              checked={question.correctIds.includes(row.id)}
              onChange={(event) =>
                onChange({
                  ...question,
                  correctIds: event.target.checked
                    ? [...question.correctIds, row.id]
                    : question.correctIds.filter((id) => id !== row.id),
                })
              }
            />
          )}
          onChange={(options) =>
            onChange({ ...question, options, correctIds: question.correctIds.filter((id) => options.some((o) => o.id === id)) })
          }
        />
      );
    case 'boolean':
      return (
        <fieldset className="choice-line">
          <legend>{t('correctIs')}</legend>
          {[true, false].map((value) => (
            <label key={String(value)}>
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correct === value}
                onChange={() => onChange({ ...question, correct: value })}
              />
              {t(value ? 'yes' : 'no')}
            </label>
          ))}
        </fieldset>
      );
    case 'text': {
      // Написання не мають власних id, тому ключем рядка є його позиція.
      const rows = question.accepted.map((text, index) => ({ id: String(index), text }));
      return (
        <>
          <Rows
            rows={rows}
            min={1}
            max={LIMITS.maxAccepted}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            onChange={(next) => onChange({ ...question, accepted: next.map((row) => row.text) })}
          />
          <p className="meta">{t('spellingHint')}</p>
        </>
      );
    }
    case 'numeric':
      return (
        <>
          <div className="pair">
            <label className="field">
              <span>{t('correctNumber')}</span>
              <input
                inputMode="decimal"
                value={shown(question.correct)}
                onChange={(event) => onChange({ ...question, correct: asNumber(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>{t('tolerance')}</span>
              <input
                inputMode="decimal"
                value={shown(question.tolerance)}
                onChange={(event) => onChange({ ...question, tolerance: asNumber(event.target.value) })}
              />
            </label>
          </div>
          <p className="meta">{t('toleranceHint')}</p>
        </>
      );
    case 'order':
      return (
        <>
          <p className="meta">{t('orderHint')}</p>
          <Rows
            rows={question.items}
            min={LIMITS.minOrderItems}
            max={LIMITS.maxOrderItems}
            label="itemN"
            removeLabel="removeItem"
            addLabel="addItem"
            mark={(_row, index) => <span className="letter">{index + 1}</span>}
            onChange={(items) => onChange({ ...question, items })}
          />
        </>
      );
  }
}

export function QuestionEditor({ question, onChange }: Props) {
  return (
    <div className="question-edit">
      <label className="field">
        <span>{t('questionText')}</span>
        <textarea
          rows={2}
          value={question.text}
          maxLength={LIMITS.questionText}
          onChange={(event) => onChange({ ...question, text: event.target.value })}
        />
      </label>
      <div className="pair">
        <label className="field">
          <span>{t('questionType')}</span>
          <select value={question.type} onChange={(event) => onChange(changeType(question, event.target.value as QuestionType))}>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('timeLimit')}</span>
          <input
            inputMode="numeric"
            value={shown(question.timeLimit)}
            onChange={(event) => onChange({ ...question, timeLimit: asNumber(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>{t('pointsLabel')}</span>
          <input
            inputMode="numeric"
            value={shown(question.points)}
            onChange={(event) => onChange({ ...question, points: asNumber(event.target.value) })}
          />
        </label>
      </div>
      <Body question={question} onChange={onChange} />
    </div>
  );
}
```

`apps/web/src/editor/QuizEditor.tsx`:

```tsx
import { LIMITS, type Question, type Quiz } from '@quiz/shared';
import { useState } from 'react';
import { t } from '../i18n';
import { cleaned, newQuestion, problemsOf } from './draft';
import { QuestionEditor } from './QuestionEditor';

interface Props {
  initial: Quiz;
  heading: string;
  /** Зберігає вікторину; повертає текст помилки або null. */
  onSave: (quiz: Quiz) => Promise<string | null>;
  onCancel: () => void;
}

export function QuizEditor({ initial, heading, onSave, onCancel }: Props) {
  const [quiz, setQuiz] = useState(initial);
  const [openIndex, setOpenIndex] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { questions, settings } = quiz;

  const setQuestions = (next: Question[]) => setQuiz((current) => ({ ...current, questions: next }));
  const setSettings = (patch: Partial<Quiz['settings']>) =>
    setQuiz((current) => ({ ...current, settings: { ...current.settings, ...patch } }));

  const move = (index: number, step: -1 | 1) => {
    const next = [...questions];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setQuestions(next);
    if (openIndex === index) setOpenIndex(index + step);
    else if (openIndex === index + step) setOpenIndex(index);
  };

  const remove = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
    setOpenIndex(Math.max(0, openIndex > index || openIndex === questions.length - 1 ? openIndex - 1 : openIndex));
  };

  const add = () => {
    setQuestions([...questions, newQuestion('single')]);
    setOpenIndex(questions.length);
  };

  const save = async () => {
    const found = problemsOf(quiz);
    setProblems(found);
    if (found.length > 0) return;
    setSaving(true);
    const error = await onSave(cleaned(quiz));
    setSaving(false);
    if (error !== null) setProblems([error]);
  };

  return (
    <main className="app editor">
      <h1 className="brand">{heading}</h1>

      <section className="panel">
        <label className="field">
          <span>{t('quizTitle')}</span>
          <input value={quiz.title} maxLength={120} onChange={(event) => setQuiz({ ...quiz, title: event.target.value })} />
        </label>
        <label className="field">
          <span>{t('quizDescription')}</span>
          <input
            value={quiz.description}
            maxLength={500}
            onChange={(event) => setQuiz({ ...quiz, description: event.target.value })}
          />
        </label>
      </section>

      <section className="panel">
        <h2>{t('settingsTitle')}</h2>
        <label className="check">
          <input type="checkbox" checked={settings.speedBonus} onChange={(event) => setSettings({ speedBonus: event.target.checked })} />
          <span>{t('speedBonus')}</span>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.shuffleOptions}
            onChange={(event) => setSettings({ shuffleOptions: event.target.checked })}
          />
          <span>{t('shuffleOptions')}</span>
        </label>
        <label className="field">
          <span>{t('leaderboardLabel')}</span>
          <select
            value={settings.leaderboard}
            onChange={(event) => setSettings({ leaderboard: event.target.value === 'end' ? 'end' : 'each' })}
          >
            <option value="each">{t('leaderboardEach')}</option>
            <option value="end">{t('leaderboardEnd')}</option>
          </select>
        </label>
      </section>

      {questions.map((question, index) => (
        <section className={index === openIndex ? 'panel qcard is-open' : 'panel qcard'} key={question.id}>
          <div className="qcard-head">
            <button
              type="button"
              className="qcard-title"
              aria-expanded={index === openIndex}
              onClick={() => setOpenIndex(index)}
            >
              <span className="letter">{t('questionN', { index: index + 1 })}</span>
              <span className="qcard-text">{question.text.trim() === '' ? t('untitled') : question.text}</span>
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveQuestionUp', { index: index + 1 })}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveQuestionDown', { index: index + 1 })}
              disabled={index === questions.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('removeQuestion', { index: index + 1 })}
              disabled={questions.length === 1}
              onClick={() => remove(index)}
            >
              ×
            </button>
          </div>
          {index === openIndex && (
            <QuestionEditor
              question={question}
              onChange={(next) => setQuestions(questions.map((q, i) => (i === index ? next : q)))}
            />
          )}
        </section>
      ))}

      <button type="button" className="btn" disabled={questions.length >= LIMITS.maxQuestions} onClick={add}>
        {t('addQuestion')}
      </button>

      {problems.length > 0 && (
        <ul className="error problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <footer className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {t(saving ? 'saving' : 'save')}
        </button>
      </footer>
    </main>
  );
}
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm vitest run apps/web/src/editor`
Expected: PASS, 19 тестів (9 + 10).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add quiz editor for all question types"
```

---

### Task 4: Сторінки вікторин, доступ до пульта, маршрути

**Files:**
- Create: `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/pages/EditQuiz.tsx`
- Modify: `apps/web/src/pages/Host.tsx` (повна заміна), `apps/web/src/pages/Home.tsx`, `apps/web/src/main.tsx` (повна заміна), `apps/web/src/styles.css`, `README.md`
- Delete: `apps/web/src/pages/NewGame.tsx`, `apps/web/src/quiz-file.ts`, `apps/web/src/quiz-file.test.ts`
- Test: `apps/web/src/pages/Quizzes.test.tsx`, `apps/web/src/pages/EditQuiz.test.tsx`, `apps/web/src/pages/Host.test.tsx`

**Interfaces:**
- Consumes: `api.ts`, `useAccount` (завдання 1); `QuizEditor`, `newQuiz` (завдання 2, 3); `demoQuiz`; `storage`.
- Produces: маршрути `/login`, `/quizzes`, `/quizzes/new`, `/quizzes/:id`; `/new` перенаправляє на `/quizzes`; головна сторінка має посилання «Я ведучий» на `/quizzes`.

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/pages/Quizzes.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, createQuiz, deleteQuiz, listQuizzes, me, signOut } from '../api';
import { loadHost } from '../storage';
import { Quizzes } from './Quizzes';

vi.mock('../api', () => ({
  me: vi.fn(),
  listQuizzes: vi.fn(),
  createQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  createGame: vi.fn(),
  signOut: vi.fn(),
}));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com' };
const summary = { id: 'q1', title: 'Географія', description: 'Про Україну', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z' };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue(account);
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const open = () =>
  render(
    <MemoryRouter initialEntries={['/quizzes']}>
      <Routes>
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Quizzes', () => {
  it('sends a visitor without a session to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    expect(listQuizzes).not.toHaveBeenCalled();
  });

  it('sends the host to sign in when the session ends while the list is open', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('lists the host’s quizzes', async () => {
    open();
    expect(await screen.findByText('Географія')).toBeTruthy();
    expect(screen.getByText('Запитань: 6')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Редагувати' }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
  });

  it('invites to create the first quiz when there are none', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ваші вікторини/)).toBeTruthy();
  });

  it('starts a game, remembers the host tokens and opens the control panel', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
  });

  it('explains why a game could not be started', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'server_busy' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Сервер перевантажений. Спробуйте за хвилину.');
  });

  it('deletes a quiz only after confirmation and reloads the list', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(deleteQuiz).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));
    expect(deleteQuiz).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Видалити вікторину «Географія»? Це не можна скасувати.');

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(deleteQuiz).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('adds the example quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q2' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Додати приклад' }));
    await waitFor(() => expect(createQuiz).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createQuiz).mock.calls[0][0].questions).toHaveLength(6);
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('signs out and returns home', async () => {
    vi.mocked(signOut).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Вийти' }));
    expect(await screen.findByText('головна')).toBeTruthy();
    expect(signOut).toHaveBeenCalled();
  });
});
```

`apps/web/src/pages/EditQuiz.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuiz, getQuiz, me, updateQuiz } from '../api';
import { demoQuiz } from '../demo-quiz';
import { EditQuiz } from './EditQuiz';

vi.mock('../api', () => ({ me: vi.fn(), getQuiz: vi.fn(), createQuiz: vi.fn(), updateQuiz: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/quizzes" element={<p>мої вікторини</p>} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('EditQuiz', () => {
  it('loads a saved quiz, saves the changes and returns to the list', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    open('/quizzes/q1');

    const title = (await screen.findByLabelText('Назва вікторини')) as HTMLInputElement;
    expect(title.value).toBe(demoQuiz.title);
    fireEvent.change(title, { target: { value: 'Нова назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(updateQuiz).toHaveBeenCalledWith('q1', expect.objectContaining({ title: 'Нова назва' }));
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('creates a new quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q9' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Гра' }));
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it('keeps the editor open and explains when saving fails', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'offline' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    fireEvent.change(screen.getByLabelText('Тип запитання'), { target: { value: 'boolean' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
    expect((screen.getByLabelText('Назва вікторини') as HTMLInputElement).value).toBe('Гра');
  });

  it('sends the host to sign in when the session has ended', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/q1');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('says so when the quiz does not exist', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/quizzes/q1');
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });
});
```

`apps/web/src/pages/Host.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostAccess } from '../api';
import { loadHost, saveHost } from '../storage';
import { Host } from './Host';

const { auths } = vi.hoisted(() => ({ auths: [] as unknown[] }));

vi.mock('socket.io-client', () => ({
  io: (options: { auth: unknown }) => {
    auths.push(options.auth);
    return { connected: false, on() { return this; }, emit() {}, close() {} };
  },
}));
vi.mock('../api', () => ({ hostAccess: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auths.length = 0;
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/host/123456']}>
      <Routes>
        <Route path="/host/:code" element={<Host />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Host', () => {
  it('uses the tokens remembered on this device without asking the server', async () => {
    saveHost('123456', { hostToken: 'local-host', stageToken: 'local-stage' });
    open();
    expect(await screen.findByText('Підключаємося…')).toBeTruthy();
    expect(hostAccess).not.toHaveBeenCalled();
    expect(auths).toEqual([{ code: '123456', role: 'host', token: 'local-host' }]);
  });

  it('asks the server for the tokens on a new device and remembers them', async () => {
    vi.mocked(hostAccess).mockResolvedValue({ ok: true, hostToken: 'from-server', stageToken: 'stage' });
    open();
    expect(await screen.findByText('Підключаємося…')).toBeTruthy();
    expect(hostAccess).toHaveBeenCalledWith('123456');
    expect(loadHost('123456')).toEqual({ hostToken: 'from-server', stageToken: 'stage' });
    expect(auths).toEqual([{ code: '123456', role: 'host', token: 'from-server' }]);
  });

  it('offers to sign in when the server does not recognise the host', async () => {
    vi.mocked(hostAccess).mockResolvedValue({ ok: false, error: 'game_not_found' });
    open();
    expect(await screen.findByText(/немає доступу до пульта цієї гри/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Увійти' }).getAttribute('href')).toBe('/login?next=%2Fhost%2F123456');
    expect(auths).toEqual([]);
  });
});
```

Run: `pnpm vitest run apps/web/src/pages`
Expected: FAIL: модулів `./Quizzes`, `./EditQuiz` немає; `Host` не звертається по `hostAccess`.

- [ ] **Step 2: Написати сторінки**

`apps/web/src/pages/Quizzes.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { createGame, createQuiz, deleteQuiz, listQuizzes, signOut, type QuizSummary } from '../api';
import { demoQuiz } from '../demo-quiz';
import { errorText, t } from '../i18n';
import { saveHost } from '../storage';
import { useAccount } from '../useAccount';

const LOGIN = '/login?next=%2Fquizzes';

export function Quizzes() {
  const navigate = useNavigate();
  const account = useAccount();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedIn = account.status === 'signed-in';

  /** Показує помилку; закінчену сесію перетворює на перехід до входу. */
  const fail = useCallback((code: string) => {
    if (code === 'unauthorized') setExpired(true);
    else setError(errorText(code));
  }, []);

  const reload = useCallback(async () => {
    const result = await listQuizzes();
    if (result.ok) setQuizzes(result.data);
    else fail(result.error);
  }, [fail]);

  useEffect(() => {
    if (signedIn) void reload();
  }, [signedIn, reload]);

  if (account.status === 'anonymous' || expired) return <Navigate to={LOGIN} replace />;
  if (account.status === 'loading') {
    return (
      <main className="app narrow">
        <p className="lead">{t('loading')}</p>
      </main>
    );
  }

  /** Виконує дію зі списком, не даючи запустити другу одночасно. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    await action();
    setBusy(false);
  };

  const play = (quiz: QuizSummary) =>
    run(async () => {
      const result = await createGame(quiz.id);
      if (!result.ok) return fail(result.error);
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      navigate(`/host/${result.code}`);
    });

  const remove = (quiz: QuizSummary) => {
    if (!window.confirm(t('removeConfirm', { title: quiz.title }))) return;
    void run(async () => {
      const result = await deleteQuiz(quiz.id);
      if (!result.ok) return fail(result.error);
      await reload();
    });
  };

  const addDemo = () =>
    run(async () => {
      const result = await createQuiz(demoQuiz);
      if (!result.ok) return fail(result.error);
      await reload();
    });

  const leave = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <main className="app wide">
      <header className="bar">
        <span>{account.account.name}</span>
        <button type="button" className="btn btn-small" onClick={leave}>
          {t('signOut')}
        </button>
      </header>
      <h1 className="brand">{t('quizzesTitle')}</h1>

      <div className="toolbar">
        <Link className="btn btn-primary" to="/quizzes/new">
          {t('newQuiz')}
        </Link>
        <button type="button" className="btn" disabled={busy} onClick={addDemo}>
          {t('addDemo')}
        </button>
      </div>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && <p className="meta">{t('loading')}</p>}
      {quizzes !== null && quizzes.length === 0 && <p className="lead">{t('noQuizzes')}</p>}
      {quizzes !== null && quizzes.length > 0 && (
        <ul className="quiz-list">
          {quizzes.map((quiz) => (
            <li className="panel" key={quiz.id}>
              <div>
                <h2>{quiz.title}</h2>
                {quiz.description !== '' && <p className="meta">{quiz.description}</p>}
                <p className="meta">{t('questionCount', { count: quiz.questionCount })}</p>
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(quiz)}>
                  {t('play')}
                </button>
                <Link className="btn" to={`/quizzes/${quiz.id}`}>
                  {t('edit')}
                </Link>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(quiz)}>
                  {t('remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

`apps/web/src/pages/EditQuiz.tsx`:

```tsx
import type { Quiz } from '@quiz/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { createQuiz, getQuiz, updateQuiz } from '../api';
import { newQuiz } from '../editor/draft';
import { QuizEditor } from '../editor/QuizEditor';
import { errorText, t } from '../i18n';
import { useAccount } from '../useAccount';

export function EditQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const account = useAccount();
  const fresh = useMemo(() => newQuiz(), []);
  const [loaded, setLoaded] = useState<Quiz | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const signedIn = account.status === 'signed-in';

  useEffect(() => {
    if (!signedIn || id === undefined) return;
    let current = true;
    void getQuiz(id).then((result) => {
      if (!current) return;
      if (result.ok) setLoaded(result.data);
      else if (result.error === 'unauthorized') setExpired(true);
      else setLoadError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [signedIn, id]);

  if (account.status === 'anonymous' || expired) {
    const here = id === undefined ? '/quizzes/new' : `/quizzes/${id}`;
    return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  }

  if (loadError !== null) {
    return (
      <main className="app narrow">
        <p className="error" role="alert">
          {loadError}
        </p>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  const initial = id === undefined ? fresh : loaded;
  if (account.status === 'loading' || initial === null) {
    return (
      <main className="app narrow">
        <p className="lead">{t('loading')}</p>
      </main>
    );
  }

  const save = async (quiz: Quiz): Promise<string | null> => {
    const result = id === undefined ? await createQuiz(quiz) : await updateQuiz(id, quiz);
    if (!result.ok) {
      if (result.error === 'unauthorized') setExpired(true);
      return errorText(result.error);
    }
    navigate('/quizzes');
    return null;
  };

  return (
    <QuizEditor
      initial={initial}
      heading={t(id === undefined ? 'editorNew' : 'editorEdit')}
      onSave={save}
      onCancel={() => navigate('/quizzes')}
    />
  );
}
```

`apps/web/src/pages/Host.tsx` (повний вміст):

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SocketAuth } from '@quiz/shared';
import { hostAccess } from '../api';
import { t } from '../i18n';
import { useGame } from '../live/useGame';
import { HostScreen } from '../screens/HostScreen';
import { loadHost, saveHost, type HostTokens } from '../storage';

type Access = { status: 'asking' } | { status: 'denied' } | { status: 'granted'; tokens: HostTokens };

/** Токени пульта: з цього пристрою, а якщо їх тут немає, то із сервера за сесією ведучого. */
function useHostTokens(code: string): Access {
  const [access, setAccess] = useState<Access>(() => {
    const local = loadHost(code);
    return local === null ? { status: 'asking' } : { status: 'granted', tokens: local };
  });

  useEffect(() => {
    if (access.status !== 'asking') return;
    let current = true;
    void hostAccess(code).then((result) => {
      if (!current) return;
      if (!result.ok) return setAccess({ status: 'denied' });
      const tokens = { hostToken: result.hostToken, stageToken: result.stageToken };
      saveHost(code, tokens);
      setAccess({ status: 'granted', tokens });
    });
    return () => {
      current = false;
    };
  }, [access.status, code]);

  return access;
}

export function Host() {
  const { code = '' } = useParams();
  const access = useHostTokens(code);
  const tokens = access.status === 'granted' ? access.tokens : null;
  const auth = useMemo<SocketAuth | null>(
    () => (tokens === null ? null : { code, role: 'host', token: tokens.hostToken }),
    [code, tokens],
  );
  const game = useGame(auth);

  if (access.status === 'denied') {
    return (
      <main className="app narrow">
        <p className="lead">{t('noHostAccess')}</p>
        <Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/host/${code}`)}`}>
          {t('joinButton')}
        </Link>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  if (tokens !== null && (game.status === 'unauthorized' || game.closed !== null)) {
    return (
      <main className="app narrow">
        <p className="lead">{t('gameGone')}</p>
        <Link className="quiet-link" to="/quizzes">
          {t('quizzesTitle')}
        </Link>
      </main>
    );
  }

  if (tokens === null || game.view === null || game.view.role !== 'host') {
    return (
      <main className="app narrow">
        <p className="lead">{t(game.status === 'offline' ? 'offline' : 'connecting')}</p>
      </main>
    );
  }

  const origin = window.location.origin;
  return (
    <>
      {game.status === 'offline' && (
        <p className="banner is-offline" role="status">
          {t('offline')}
        </p>
      )}
      <HostScreen
        view={game.view}
        code={code}
        stageUrl={`${origin}/stage/${code}#${tokens.stageToken}`}
        joinUrl={`${origin}/play/${code}`}
        send={game.send}
      />
    </>
  );
}
```

`apps/web/src/main.tsx` (повний вміст):

```tsx
import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EditQuiz } from './pages/EditQuiz';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { Play } from './pages/Play';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/quizzes" element={<Quizzes />} />
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/new" element={<Navigate to="/quizzes" replace />} />
        <Route path="/play/:code" element={<Play />} />
        <Route path="/host/:code" element={<Host />} />
        <Route path="/stage/:code" element={<Stage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
```

У `apps/web/src/pages/Home.tsx` замінити посилання на `/new`:

```tsx
      <Link className="quiet-link" to="/quizzes">
        {t('hostEntry')}
      </Link>
```

У `apps/web/src/i18n.ts` змінити текст `noHostAccess` на `'На цьому пристрої немає доступу до пульта цієї гри. Увійдіть в акаунт, з якого її створено.'` і прибрати ключі, що більше не використовуються: `hostLink`, `newGameTitle`, `demoQuiz`, `uploadQuiz`, `uploadHint`, `quizReady`, `createGame`, `creating`, `badQuizFile`.

Видалити `apps/web/src/pages/NewGame.tsx`, `apps/web/src/quiz-file.ts`, `apps/web/src/quiz-file.test.ts`.

- [ ] **Step 3: Додати оформлення**

Додати в кінець `apps/web/src/styles.css`:

```css
/* ---------- Акаунт, список вікторин, редактор ---------- */

.app.wide,
.app.editor {
  max-width: 46rem;
}

.btn-quiet {
  border-color: transparent;
  color: var(--dim);
}

a.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.quiz-list {
  display: grid;
  gap: 1rem;
}

.quiz-list h2 {
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.field textarea,
.field select,
.row-edit input:not([type='radio']):not([type='checkbox']) {
  min-height: 3rem;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--line);
  border-radius: 0.75rem;
  background: rgb(0 0 0 / 0.25);
  color: var(--paper);
  font: inherit;
}

.field textarea {
  resize: vertical;
}

.field select option {
  background: var(--stage);
}

.field textarea:focus-visible,
.field select:focus-visible,
.row-edit input:focus-visible {
  border-color: var(--amber);
  outline: none;
}

.check,
.choice-line label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
}

input[type='checkbox'],
input[type='radio'] {
  flex: none;
  width: 1.375rem;
  height: 1.375rem;
  accent-color: var(--amber);
}

.choice-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.5rem;
  margin: 0;
  padding: 0;
  border: 0;
}

.choice-line legend {
  padding: 0;
  font-weight: 600;
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.75rem;
}

.question-edit,
.rows-edit {
  display: grid;
  gap: 0.75rem;
}

.rows-edit > .btn {
  justify-self: start;
}

.row-edit {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.row-edit input:not([type='radio']):not([type='checkbox']) {
  flex: 1;
  min-width: 0;
}

.qcard {
  padding: 0.75rem;
}

.qcard.is-open {
  border-color: var(--amber);
}

.qcard-head {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.qcard-title {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 0.75rem;
  min-width: 0;
  min-height: 3rem;
  padding: 0.25rem 0.5rem;
  border: 0;
  background: none;
  color: var(--paper);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.qcard-title .letter {
  white-space: nowrap;
}

.qcard-text {
  overflow: hidden;
  color: var(--dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qcard .question-edit {
  padding: 0.5rem;
}

.problems {
  display: grid;
  gap: 0.25rem;
  padding-left: 1.25rem;
  list-style: disc;
}
```

- [ ] **Step 4: Переконатися, що все працює**

Run: `pnpm test`
Expected: PASS: усі тести, зокрема 17 нових у `apps/web/src/pages` (9 + 5 + 3); тести `quiz-file` зникли разом із модулем.

Run: `pnpm typecheck`
Expected: без помилок.

Run: `pnpm build`
Expected: збірка без помилок.

- [ ] **Step 5: Пройти шлях ведучого в браузері**

З піднятою базою (`pnpm db:up`) запустити `pnpm start` і скриптом на `playwright-core` (поза репозиторієм) пройти: реєстрація → «Додати приклад» → створення власної вікторини з двох запитань у редакторі → «Грати» → гравець входить за кодом → ведучий стартує → гравець відповідає → розкриття. Потім у новому контексті браузера (інший «пристрій») увійти тим самим акаунтом, відкрити `/host/<код>` і переконатися, що пульт працює. Зняти знімки входу, списку, редактора (390 px і 900 px).

Expected: сценарій проходить без помилок у консолі; на знімках нічого не обрізано. Тестового користувача після перевірки видалити з бази.

- [ ] **Step 6: Оновити README і закомітити**

У `README.md` в розділі «Як зіграти локально» замінити абзац, що починається з «Відкрийте http://localhost:3000/new», на:

```markdown
Відкрийте http://localhost:3000 на комп'ютері, натисніть «Я ведучий»,
зареєструйтесь і додайте приклад вікторини або створіть власну в редакторі.
Кнопка «Грати» відкриває пульт; «Відкрити сцену» на пульті показує екран для
телевізора. Гравці з телефонів у тій самій мережі Wi-Fi заходять на адресу
комп'ютера (наприклад, http://192.168.0.10:3000) і вводять код гри або
сканують QR-код зі сцени, якщо сцену відкрито за цією ж адресою.
```

```bash
git add -A apps/web README.md
git commit -m "feat(web): add quiz list, editor pages and host access from any device"
```
