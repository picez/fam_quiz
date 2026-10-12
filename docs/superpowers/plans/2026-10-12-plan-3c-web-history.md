# План 3в: екрани історії — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ведучий бачить у браузері історію своїх ігор і деталі кожної; гравець з акаунтом бачить свої зіграні ігри та просту статистику; будь-яка помилка сторінки показує зрозумілий екран замість порожнього.

**Architecture:** Три нові сторінки `apps/web` читають API плану 2в через `api.ts`. Спільний хук `usePrivateData` поєднує перевірку сесії із завантаженням даних і однаково обробляє «не увійшов», «сесія закінчилась» і помилку. `ErrorBoundary` огортає всі маршрути.

**Tech Stack:** React 19, React Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-12-quiz-live-core-design.md`

## Global Constraints

- Усі тексти в `apps/web/src/i18n.ts`; дати показуються у форматі `uk-UA`.
- Сторінки історії потребують входу й перенаправляють на `/login` з параметром `next`.
- Сторінки нічого не обчислюють про гру самі, крім зведеної статистики гравця з отриманого списку.
- Оформлення «Нічний ефір»; на екрані 360 px нічого не виходить за край.

## Review Focus

1. Історія порожня (нова людина): замість порожнього місця пояснення, що тут з'явиться і як цього досягти. Тести в завданнях 2 і 3.
2. Гра перервана або ще триває: статус показано словами, місця можуть бути відсутні, і це не виглядає як помилка. Тест у завданні 2.
3. Сесія закінчилась, поки відкрито історію: перехід на вхід із поверненням на ту саму сторінку. Тест у завданні 1.
4. Гравець без акаунта на формі входу в гру: видно, що історія не збережеться, і є шлях увійти, не загубивши код гри. Тест у завданні 3.
5. Компонент сторінки падає з помилкою: видно повідомлення й кнопку перезавантаження, а не порожній екран. Тест у завданні 1.

---

### Task 1: Запити, спільний хук, екран помилки

**Files:**
- Modify: `apps/web/src/api.ts`, `apps/web/src/i18n.ts`, `apps/web/src/format.ts`
- Create: `apps/web/src/usePrivateData.ts`, `apps/web/src/ErrorBoundary.tsx`
- Test: `apps/web/src/usePrivateData.test.tsx`, `apps/web/src/ErrorBoundary.test.tsx`, `apps/web/src/format.test.ts` (додати тест)

**Interfaces:**
- Produces:
  - `listGames(): Promise<ApiData<GameSummary[]>>`, `getGame(id): Promise<ApiData<GameDetail>>`, `myHistory(): Promise<ApiData<PlayedGame[]>>`
  - `formatDate(iso: string): string`
  - `type PrivateData<T> = { status: 'loading' } | { status: 'signed-out' } | { status: 'error'; message: string } | { status: 'ready'; data: T; account: Account }`
  - `usePrivateData<T>(load: () => Promise<ApiData<T>>, key?: string): PrivateData<T>`
  - `<ErrorBoundary>`

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/usePrivateData.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, type ApiData } from './api';
import { usePrivateData } from './usePrivateData';

vi.mock('./api', () => ({ me: vi.fn() }));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com' };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function Probe({ load }: { load: () => Promise<ApiData<string[]>> }) {
  const state = usePrivateData(load);
  if (state.status === 'ready') return <p>{`${state.account.name}: ${state.data.join(', ')}`}</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  return <p>{state.status}</p>;
}

describe('usePrivateData', () => {
  it('loads the data for a signed-in person', async () => {
    vi.mocked(me).mockResolvedValue(account);
    const load = vi.fn(async () => ({ ok: true as const, data: ['а', 'б'] }));
    render(<Probe load={load} />);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('Олена: а, б')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not load anything for a visitor', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    const load = vi.fn(async () => ({ ok: true as const, data: [] }));
    render(<Probe load={load} />);
    expect(await screen.findByText('signed-out')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it('treats a session that ended before the data arrived as signed out', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Probe load={async () => ({ ok: false, error: 'unauthorized' })} />);
    expect(await screen.findByText('signed-out')).toBeTruthy();
  });

  it('explains other failures in words', async () => {
    vi.mocked(me).mockResolvedValue(account);
    render(<Probe load={async () => ({ ok: false, error: 'not_found' })} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });
});
```

`apps/web/src/ErrorBoundary.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Broken(): never {
  throw new Error('crypto.randomUUID is not a function');
}

describe('ErrorBoundary', () => {
  it('shows its children when nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>усе гаразд</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('усе гаразд')).toBeTruthy();
  });

  it('replaces a crashed page with an explanation and a way to reload', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Щось зламалося на цій сторінці.');
    expect(screen.getByRole('button', { name: 'Перезавантажити сторінку' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'На головну' }).getAttribute('href')).toBe('/');
    expect(screen.getByText(/crypto\.randomUUID is not a function/)).toBeTruthy();
  });
});
```

Додати в кінець `apps/web/src/format.test.ts` (і `formatDate` до імпорту з `./format`):

```ts
describe('formatDate', () => {
  it('shows the day, the month in words and the time', () => {
    const text = formatDate('2026-10-12T15:30:00.000Z');
    expect(text).toMatch(/\d{1,2} жовт/);
    expect(text).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatDate('не дата')).toBe('');
  });
});
```

Run: `pnpm vitest run apps/web/src/usePrivateData.test.tsx apps/web/src/ErrorBoundary.test.tsx apps/web/src/format.test.ts`
Expected: FAIL, модулів `./usePrivateData`, `./ErrorBoundary` і функції `formatDate` немає.

- [ ] **Step 2: Написати реалізацію**

У `apps/web/src/api.ts`: до імпорту типів з `@quiz/shared` додати `GameDetail, GameSummary, PlayedGame`, а в кінець файла:

```ts
export const listGames = () => fetchData<GameSummary[]>('/api/games');
export const getGame = (id: string) => fetchData<GameDetail>(`/api/games/${encodeURIComponent(id)}`);
export const myHistory = () => fetchData<PlayedGame[]>('/api/me/history');
```

У кінець `apps/web/src/format.ts`:

```ts
const dateFormat = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Дата й час гри словами; порожній рядок, якщо значення не є датою. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}
```

`apps/web/src/usePrivateData.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import type { Account, ApiData } from './api';
import { errorText } from './i18n';
import { useAccount } from './useAccount';

export type PrivateData<T> =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; account: Account };

type Loaded<T> = { key: string; result: ApiData<T> };

/**
 * Дані, які бачить лише людина, що увійшла. Спершу з'ясовує, хто на сторінці, потім
 * завантажує; закінчену сесію показує так само, як відсутню.
 */
export function usePrivateData<T>(load: () => Promise<ApiData<T>>, key = ''): PrivateData<T> {
  const account = useAccount();
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const loader = useRef(load);
  loader.current = load;
  const signedIn = account.status === 'signed-in';

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    void loader.current().then((result) => {
      if (current) setLoaded({ key, result });
    });
    return () => {
      current = false;
    };
  }, [signedIn, key]);

  if (account.status === 'anonymous') return { status: 'signed-out' };
  if (account.status === 'loading' || loaded === null || loaded.key !== key) return { status: 'loading' };
  if (loaded.result.ok) return { status: 'ready', data: loaded.result.data, account: account.account };
  return loaded.result.error === 'unauthorized'
    ? { status: 'signed-out' }
    : { status: 'error', message: errorText(loaded.result.error) };
}
```

`apps/web/src/ErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react';
import { t } from './i18n';

interface State {
  error: Error | null;
}

/** Ловить помилку будь-якої сторінки, щоб людина бачила пояснення, а не порожній екран. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <main className="app narrow">
        <div className="panel" role="alert">
          <h2>{t('crashTitle')}</h2>
          <p>{t('crashHint')}</p>
          <p className="meta">{error.message}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('reloadPage')}
        </button>
        <a className="quiet-link" href="/">
          {t('backHome')}
        </a>
      </main>
    );
  }
}
```

У `apps/web/src/i18n.ts` перед рядком `  // Помилки` додати:

```ts
  // Історія
  historyTitle: 'Історія ігор',
  historyEmpty: 'Тут з’являться ігри, які ви провели. Запустіть гру зі списку вікторин.',
  myGamesTitle: 'Мої ігри',
  myGamesEmpty: 'Тут з’являться ігри, у які ви зіграли, увійшовши в акаунт. Увійдіть перед тим, як вводити код гри.',
  status_running: 'триває',
  status_finished: 'завершено',
  status_aborted: 'перервано',
  playersCount: 'Гравців: {count}',
  questionsProgress: 'Запитань зіграно: {played} з {total}',
  standingsTitle: 'Підсумки',
  questionsTitle: 'Запитання',
  noPlayers: 'У цій грі не було гравців.',
  correctOf: 'правильних: {correct}',
  answeredStat: 'відповіли {answered}, правильно {accepted}',
  playedAs: 'ви грали як {nickname}',
  yourResult: '{score} балів, правильних відповідей: {correct} з {total}',
  placeOf: '{rank} місце з {total}',
  noPlace: 'без місця',
  statGames: 'ігор',
  statWins: 'перемог',
  statAccuracy: 'правильних відповідей',
  toQuizzes: 'Мої вікторини',
  playingAs: 'Ви увійшли як {name}: гра потрапить у «Мої ігри».',
  signInToKeep: 'Увійти, щоб гра збереглась у «Мої ігри»',
  crashTitle: 'Щось зламалося на цій сторінці.',
  crashHint: 'Спробуйте перезавантажити її. Якщо це повторюється, повідомте, що ви робили перед цим.',
  reloadPage: 'Перезавантажити сторінку',
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 358 тестів (350 попередніх + 8 нових).

Run: `pnpm typecheck`
Expected: без помилок.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add history API calls, private data hook and crash screen"
```

---

### Task 2: Історія ведучого

**Files:**
- Create: `apps/web/src/pages/History.tsx`, `apps/web/src/pages/GameHistory.tsx`
- Test: `apps/web/src/pages/History.test.tsx`

**Interfaces:**
- Consumes: `listGames`, `getGame`, `usePrivateData`, `formatDate`, `t` (завдання 1); типи `GameSummary`, `GameDetail`.
- Produces: сторінки `History` (`/history`) і `GameHistory` (`/history/:id`).

- [ ] **Step 1: Написати тест, що падає**

`apps/web/src/pages/History.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDetail, GameSummary } from '@quiz/shared';
import { getGame, listGames, me } from '../api';
import { GameHistory } from './GameHistory';
import { History } from './History';

vi.mock('../api', () => ({ me: vi.fn(), listGames: vi.fn(), getGame: vi.fn() }));

const summary: GameSummary = {
  id: 'g1',
  title: 'Географія',
  code: '123456',
  status: 'finished',
  startedAt: '2026-10-12T15:30:00.000Z',
  finishedAt: '2026-10-12T15:50:00.000Z',
  playerCount: 2,
  questionsPlayed: 6,
  questionCount: 6,
};

const detail: GameDetail = {
  id: 'g1',
  title: 'Географія',
  code: '123456',
  status: 'finished',
  startedAt: summary.startedAt,
  finishedAt: summary.finishedAt,
  questionsPlayed: 2,
  questionCount: 2,
  standings: [
    { participantId: 'p1', nickname: 'Олена', score: 2000, rank: 1, correct: 2 },
    { participantId: 'p2', nickname: 'Тарас', score: 0, rank: 2, correct: 0 },
  ],
  questions: [
    { index: 0, text: 'Столиця України?', type: 'single', answered: 2, accepted: 1 },
    { index: 1, text: 'Перлина біля моря?', type: 'text', answered: 1, accepted: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<GameHistory />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('History', () => {
  it('lists the games with their date, status and size', async () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [summary] });
    open('/history');
    const link = await screen.findByRole('link', { name: 'Географія' });
    expect(link.getAttribute('href')).toBe('/history/g1');
    expect(screen.getByText(/жовт.*завершено/)).toBeTruthy();
    expect(screen.getByText('Гравців: 2')).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 6 з 6')).toBeTruthy();
  });

  it('says in words that a game was interrupted or is still running', async () => {
    vi.mocked(listGames).mockResolvedValue({
      ok: true,
      data: [
        { ...summary, id: 'g2', status: 'aborted', questionsPlayed: 2 },
        { ...summary, id: 'g3', status: 'running', finishedAt: null, questionsPlayed: 1 },
      ],
    });
    open('/history');
    expect(await screen.findByText(/перервано/)).toBeTruthy();
    expect(screen.getByText(/триває/)).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 2 з 6')).toBeTruthy();
  });

  it('explains what will appear here when there are no games yet', async () => {
    vi.mocked(listGames).mockResolvedValue({ ok: true, data: [] });
    open('/history');
    expect(await screen.findByText(/Тут з’являться ігри, які ви провели/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Мої вікторини' }).getAttribute('href')).toBe('/quizzes');
  });

  it('sends a visitor to sign in and back to the history afterwards', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/history');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    expect(listGames).not.toHaveBeenCalled();
  });
});

describe('GameHistory', () => {
  it('shows the final table and how each question went', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: true, data: detail });
    open('/history/g1');
    expect(await screen.findByRole('heading', { name: 'Географія' })).toBeTruthy();
    expect(getGame).toHaveBeenCalledWith('g1');

    const rows = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(rows[0]).toContain('Олена');
    expect(rows[0]).toContain('2000');
    expect(rows[0]).toContain('правильних: 2');
    expect(rows.some((row) => row?.includes('Столиця України?') && row.includes('відповіли 2, правильно 1'))).toBe(true);
    expect(screen.getByRole('link', { name: 'Історія ігор' }).getAttribute('href')).toBe('/history');
  });

  it('shows a game without places or players without looking broken', async () => {
    vi.mocked(getGame).mockResolvedValue({
      ok: true,
      data: {
        ...detail,
        status: 'aborted',
        questionsPlayed: 1,
        standings: [{ participantId: 'p1', nickname: 'Олена', score: 500, rank: null, correct: 1 }],
        questions: detail.questions.slice(0, 1),
      },
    });
    open('/history/g1');
    expect(await screen.findByText(/перервано/)).toBeTruthy();
    expect(screen.getByText('Запитань зіграно: 1 з 2')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    cleanup();

    vi.mocked(getGame).mockResolvedValue({ ok: true, data: { ...detail, standings: [], questions: [] } });
    open('/history/g1');
    expect(await screen.findByText('У цій грі не було гравців.')).toBeTruthy();
  });

  it('says so when the game does not exist or belongs to someone else', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/history/g9');
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });

  it('sends the host to sign in when the session has ended', async () => {
    vi.mocked(getGame).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/history/g1');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });
});
```

Run: `pnpm vitest run apps/web/src/pages/History.test.tsx`
Expected: FAIL, модулів `./History` і `./GameHistory` немає.

- [ ] **Step 2: Написати реалізацію**

`apps/web/src/pages/History.tsx`:

```tsx
import { Link, Navigate } from 'react-router-dom';
import { listGames } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';

export function History() {
  const state = usePrivateData(listGames);

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fhistory" replace />;

  return (
    <main className="app wide">
      <header className="bar">
        <Link className="quiet-link" to="/quizzes">
          {t('toQuizzes')}
        </Link>
      </header>
      <h1 className="brand">{t('historyTitle')}</h1>

      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.data.length === 0 && <p className="lead">{t('historyEmpty')}</p>}
      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="quiz-list">
          {state.data.map((game) => (
            <li className="panel" key={game.id}>
              <h2>
                <Link to={`/history/${game.id}`}>{game.title}</Link>
              </h2>
              <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
              <p className="meta">{t('playersCount', { count: game.playerCount })}</p>
              <p className="meta">{t('questionsProgress', { played: game.questionsPlayed, total: game.questionCount })}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

`apps/web/src/pages/GameHistory.tsx`:

```tsx
import { Link, Navigate, useParams } from 'react-router-dom';
import { getGame } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';

export function GameHistory() {
  const { id = '' } = useParams();
  const state = usePrivateData(() => getGame(id), id);

  if (state.status === 'signed-out') {
    return <Navigate to={`/login?next=${encodeURIComponent(`/history/${id}`)}`} replace />;
  }

  const back = (
    <header className="bar">
      <Link className="quiet-link" to="/history">
        {t('historyTitle')}
      </Link>
    </header>
  );

  if (state.status !== 'ready') {
    return (
      <main className="app wide">
        {back}
        {state.status === 'loading' ? (
          <p className="meta">{t('loading')}</p>
        ) : (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
      </main>
    );
  }

  const game = state.data;
  return (
    <main className="app wide">
      {back}
      <h1 className="brand">{game.title}</h1>
      <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
      <p className="meta">{t('questionsProgress', { played: game.questionsPlayed, total: game.questionCount })}</p>

      <section className="panel">
        <h2>{t('standingsTitle')}</h2>
        {game.standings.length === 0 ? (
          <p className="meta">{t('noPlayers')}</p>
        ) : (
          <ol className="standings">
            {game.standings.map((row) => (
              <li key={row.participantId}>
                <span className="rank">{row.rank ?? '–'}</span>
                <span className="name">{row.nickname}</span>
                <span className="tag">{t('correctOf', { correct: row.correct })}</span>
                <span className="score">{row.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {game.questions.length > 0 && (
        <section className="panel">
          <h2>{t('questionsTitle')}</h2>
          <ol className="rows">
            {game.questions.map((question) => (
              <li key={question.index}>
                <span className="rank">{question.index + 1}</span>
                <span className="name">{question.text}</span>
                <span className="tag">{t('answeredStat', { answered: question.answered, accepted: question.accepted })}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Переконатися, що тести проходять**

Run: `pnpm test`
Expected: PASS, 366 тестів (358 попередніх + 8 нових).

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add the host's game history"
```

---

### Task 3: Ігри гравця, навігація, маршрути

**Files:**
- Create: `apps/web/src/pages/MyGames.tsx`
- Modify: `apps/web/src/pages/Home.tsx`, `apps/web/src/pages/Play.tsx`, `apps/web/src/pages/Quizzes.tsx`, `apps/web/src/main.tsx` (повна заміна), `apps/web/src/styles.css`
- Modify: `apps/web/src/pages/Home.test.tsx`, `apps/web/src/pages/Play.test.tsx` (додати `me` до підставного `../api` й нові тести)
- Test: `apps/web/src/pages/MyGames.test.tsx`

**Interfaces:**
- Consumes: `myHistory`, `usePrivateData`, `useAccount`, `formatDate`, `ErrorBoundary`.
- Produces: сторінка `MyGames` (`/me`); маршрути `/history`, `/history/:id`, `/me`; посилання на них зі списку вікторин і з головної; форма входу в гру показує, чи збережеться гра в історії.

- [ ] **Step 1: Написати тести, що падають**

`apps/web/src/pages/MyGames.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayedGame } from '@quiz/shared';
import { me, myHistory } from '../api';
import { MyGames } from './MyGames';

vi.mock('../api', () => ({ me: vi.fn(), myHistory: vi.fn() }));

const played = (over: Partial<PlayedGame>): PlayedGame => ({
  gameId: 'g1',
  title: 'Географія',
  status: 'finished',
  startedAt: '2026-10-12T15:30:00.000Z',
  nickname: 'Олена',
  score: 2000,
  rank: 1,
  playerCount: 5,
  correct: 4,
  answered: 5,
  questionsPlayed: 5,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
});
afterEach(cleanup);

const open = () =>
  render(
    <MemoryRouter initialEntries={['/me']}>
      <Routes>
        <Route path="/me" element={<MyGames />} />
        <Route path="/login" element={<p>сторінка входу</p>} />
      </Routes>
    </MemoryRouter>,
  );

const stat = (label: string) => screen.getByText(label).closest('.stat')?.textContent;

describe('MyGames', () => {
  it('lists played games with the place and the result', async () => {
    vi.mocked(myHistory).mockResolvedValue({ ok: true, data: [played({})] });
    open();
    expect(await screen.findByRole('heading', { name: 'Географія' })).toBeTruthy();
    expect(screen.getByText('1 місце з 5')).toBeTruthy();
    expect(screen.getByText('2000 балів, правильних відповідей: 4 з 5')).toBeTruthy();
    expect(screen.getByText(/ви грали як Олена/)).toBeTruthy();
  });

  it('sums up the games, wins and share of correct answers', async () => {
    vi.mocked(myHistory).mockResolvedValue({
      ok: true,
      data: [
        played({ gameId: 'g1', rank: 1, correct: 4, questionsPlayed: 5 }),
        played({ gameId: 'g2', rank: 3, correct: 2, questionsPlayed: 5 }),
        played({ gameId: 'g3', rank: null, status: 'aborted', correct: 0, questionsPlayed: 0 }),
      ],
    });
    open();
    await screen.findAllByRole('heading', { name: 'Географія' });
    expect(stat('ігор')).toContain('3');
    expect(stat('перемог')).toContain('1');
    expect(stat('правильних відповідей')).toContain('60%');
    expect(screen.getByText(/перервано/)).toBeTruthy();
    expect(screen.getByText('без місця')).toBeTruthy();
  });

  it('explains how games get here when there are none', async () => {
    vi.mocked(myHistory).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ігри, у які ви зіграли/)).toBeTruthy();
    expect(screen.queryByText('перемог')).toBeNull();
  });

  it('sends a visitor to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });
});
```

У `apps/web/src/pages/Home.test.tsx`: замінити підставний модуль на `vi.mock('../api', () => ({ checkCode: vi.fn(), me: vi.fn() }));`, додати `me` до імпорту з `'../api'`, у `beforeEach` додати `vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });` і в кінець файла:

```tsx
describe('Home for a signed-in person', () => {
  it('offers the quiz list and played games instead of the sign-in entry', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole('link', { name: 'Мої вікторини' })).getAttribute('href')).toBe('/quizzes');
    expect(screen.getByRole('link', { name: 'Мої ігри' }).getAttribute('href')).toBe('/me');
    expect(screen.queryByRole('link', { name: 'Я ведучий' })).toBeNull();
  });

  it('keeps the plain entry for a visitor', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>,
    );
    expect((await screen.findByRole('link', { name: 'Я ведучий' })).getAttribute('href')).toBe('/quizzes');
    expect(screen.queryByRole('link', { name: 'Мої ігри' })).toBeNull();
  });
});
```

У `apps/web/src/pages/Play.test.tsx`: замінити підставний модуль на `vi.mock('../api', () => ({ joinGame: vi.fn(), me: vi.fn() }));`, додати `me` до імпорту з `'../api'`, у `beforeEach` додати `vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });` і в кінець файла:

```tsx
describe('Play: whether the game will be kept', () => {
  it('offers a visitor to sign in without losing the game code', async () => {
    open();
    const link = await screen.findByRole('link', { name: 'Увійти, щоб гра збереглась у «Мої ігри»' });
    expect(link.getAttribute('href')).toBe('/login?next=%2Fplay%2F123456');
  });

  it('tells a signed-in player that the game will be kept', async () => {
    vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com' });
    open();
    expect(await screen.findByText('Ви увійшли як Олена: гра потрапить у «Мої ігри».')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Увійти, щоб гра збереглась/ })).toBeNull();
  });
});
```

Run: `pnpm vitest run apps/web/src/pages`
Expected: FAIL: модуля `./MyGames` немає; на головній і на формі входу в гру немає нових посилань.

- [ ] **Step 2: Написати реалізацію**

`apps/web/src/pages/MyGames.tsx`:

```tsx
import type { PlayedGame } from '@quiz/shared';
import { Link, Navigate } from 'react-router-dom';
import { myHistory } from '../api';
import { formatDate } from '../format';
import { t } from '../i18n';
import { usePrivateData } from '../usePrivateData';

/** Зведення з отриманого списку: кількість ігор, перемог і частка правильних відповідей. */
function summarize(games: PlayedGame[]) {
  const asked = games.reduce((sum, game) => sum + game.questionsPlayed, 0);
  const correct = games.reduce((sum, game) => sum + game.correct, 0);
  return {
    games: games.length,
    wins: games.filter((game) => game.status === 'finished' && game.rank === 1).length,
    accuracy: asked === 0 ? null : Math.round((correct / asked) * 100),
  };
}

export function MyGames() {
  const state = usePrivateData(myHistory);

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fme" replace />;

  const summary = state.status === 'ready' && state.data.length > 0 ? summarize(state.data) : null;

  return (
    <main className="app wide">
      <header className="bar">
        <Link className="quiet-link" to="/">
          {t('backHome')}
        </Link>
      </header>
      <h1 className="brand">{t('myGamesTitle')}</h1>

      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && state.data.length === 0 && <p className="lead">{t('myGamesEmpty')}</p>}

      {summary !== null && (
        <dl className="stats">
          <div className="stat">
            <dd>{summary.games}</dd>
            <dt>{t('statGames')}</dt>
          </div>
          <div className="stat">
            <dd>{summary.wins}</dd>
            <dt>{t('statWins')}</dt>
          </div>
          <div className="stat">
            <dd>{summary.accuracy === null ? '–' : `${summary.accuracy}%`}</dd>
            <dt>{t('statAccuracy')}</dt>
          </div>
        </dl>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="quiz-list">
          {state.data.map((game) => (
            <li className="panel" key={`${game.gameId}:${game.nickname}`}>
              <h2>{game.title}</h2>
              <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}, ${t('playedAs', { nickname: game.nickname })}`}</p>
              <p className="place">
                {game.rank === null ? t('noPlace') : t('placeOf', { rank: game.rank, total: game.playerCount })}
              </p>
              <p>{t('yourResult', { score: game.score, correct: game.correct, total: game.questionsPlayed })}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

У `apps/web/src/pages/Home.tsx`: додати імпорт `import { useAccount } from '../useAccount';`, на початку компонента `const account = useAccount();` і замінити посилання «Я ведучий» на:

```tsx
      {account.status === 'signed-in' ? (
        <nav className="toolbar centered">
          <Link className="quiet-link" to="/quizzes">
            {t('toQuizzes')}
          </Link>
          <Link className="quiet-link" to="/me">
            {t('myGamesTitle')}
          </Link>
        </nav>
      ) : (
        <Link className="quiet-link" to="/quizzes">
          {t('hostEntry')}
        </Link>
      )}
```

У `apps/web/src/pages/Play.tsx`: додати імпорт `import { useAccount } from '../useAccount';`, у `JoinForm` на початку `const account = useAccount();` і перед посиланням на головну (`<Link className="quiet-link" to="/">`) вставити:

```tsx
      {account.status === 'signed-in' && <p className="meta">{t('playingAs', { name: account.account.name })}</p>}
      {account.status === 'anonymous' && (
        <Link className="quiet-link" to={`/login?next=${encodeURIComponent(`/play/${code}`)}`}>
          {t('signInToKeep')}
        </Link>
      )}
```

У `apps/web/src/pages/Quizzes.tsx` після блоку з кнопками «Нова вікторина» та «Додати приклад» (усередині того самого `<div className="toolbar">`, останніми) додати:

```tsx
        <Link className="btn btn-quiet" to="/history">
          {t('historyTitle')}
        </Link>
        <Link className="btn btn-quiet" to="/me">
          {t('myGamesTitle')}
        </Link>
```

`apps/web/src/main.tsx` (повний вміст):

```tsx
import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { EditQuiz } from './pages/EditQuiz';
import { GameHistory } from './pages/GameHistory';
import { History } from './pages/History';
import { Home } from './pages/Home';
import { Host } from './pages/Host';
import { Login } from './pages/Login';
import { MyGames } from './pages/MyGames';
import { Play } from './pages/Play';
import { Quizzes } from './pages/Quizzes';
import { Stage } from './pages/Stage';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/quizzes" element={<Quizzes />} />
          <Route path="/quizzes/new" element={<EditQuiz />} />
          <Route path="/quizzes/:id" element={<EditQuiz />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<GameHistory />} />
          <Route path="/me" element={<MyGames />} />
          <Route path="/new" element={<Navigate to="/quizzes" replace />} />
          <Route path="/play/:code" element={<Play />} />
          <Route path="/host/:code" element={<Host />} />
          <Route path="/stage/:code" element={<Stage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
```

Додати в кінець `apps/web/src/styles.css`:

```css
/* ---------- Історія та статистика ---------- */

.toolbar.centered {
  justify-content: center;
  gap: 0.5rem 1.5rem;
}

.quiz-list h2 a {
  color: var(--paper);
  text-decoration-color: var(--amber);
  text-underline-offset: 0.2em;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin: 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 1rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 1rem;
  background: var(--panel);
}

.stat dd {
  margin: 0;
  color: var(--amber);
  font-family: var(--display);
  font-size: clamp(1.5rem, 7vw, 2.25rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.stat dt {
  color: var(--dim);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.rows .rank {
  min-width: 2rem;
  color: var(--amber);
  font-family: var(--display);
  font-weight: 800;
}

.standings li,
.rows li {
  flex-wrap: wrap;
}
```

- [ ] **Step 3: Переконатися, що все працює**

Run: `pnpm test`
Expected: PASS, 374 тести (366 попередніх + 8 нових).

Run: `pnpm typecheck` і `pnpm build`
Expected: без помилок.

- [ ] **Step 4: Пройти в браузері за мережевою адресою**

Зі запущеним сервером скриптом на `playwright-core` за адресою комп'ютера в мережі (звичайний http): ведучий реєструється, додає приклад, запускає гру; гравець спершу входить в акаунт за посиланням із форми входу в гру, повертається до тієї самої гри, грає до кінця; ведучий відкриває історію й деталі гри; гравець відкриває «Мої ігри». Зняти знімки історії, деталей і «Мої ігри» на 390 px і перевірити, що сторінки не ширші за екран на 360 px.

Expected: без помилок у консолі; гра є в обох історіях із правильними місцем і балами.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): add played games, history navigation and crash screen wiring"
```
