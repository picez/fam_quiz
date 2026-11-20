// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { GameReplay, Question, ReplayRow } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { AdminReplay } from './AdminReplay';

const base = { imageUrl: null, video: null, timeLimit: 30, points: 100 };
const capital: Question = { ...base, id: 'q1', type: 'text', text: 'Столиця Франції?', accepted: ['Париж'] };
const river: Question = { ...base, id: 'q2', type: 'text', text: 'Найдовша річка України?', accepted: ['Дніпро'], points: 200 };
const mountain: Question = { ...base, id: 'q3', type: 'single', text: 'Найвища гора?', options: [{ id: 'a', text: 'Говерла' }, { id: 'b', text: 'Піп Іван' }], correctId: 'a', points: 300 };

const row = (over: Partial<ReplayRow>): ReplayRow => ({ key: 'p1', nickname: 'Оля', answeredBy: null, attempt: 0, answer: null, spare: null, timeMs: null, verdict: 'none', manual: false, points: 0, wager: null, awayMs: null, ...over });

const replay: GameReplay = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Осінній квіз',
  code: '123456',
  status: 'finished',
  startedAt: '2026-11-10T10:00:00.000Z',
  finishedAt: '2026-11-10T11:00:00.000Z',
  autopilot: false,
  teams: false,
  rounds: [
    { title: 'Розминка', type: 'classic' },
    { title: 'Фінал', type: 'classic' },
  ],
  recorded: true,
  recordedFrom: -1,
  start: { scores: [{ key: 'p1', nickname: 'Оля', score: 0 }, { key: 'p2', nickname: 'Петро', score: 0 }], events: [] },
  steps: [
    {
      index: 0,
      roundIndex: 0,
      question: capital,
      price: 100,
      multiplier: 1,
      rows: [row({ answer: { type: 'text', value: 'Париж' }, timeMs: 4000, verdict: 'correct', manual: true, points: 100 }), row({ key: 'p2', nickname: 'Петро' })],
      scores: [{ key: 'p1', nickname: 'Оля', score: 100 }, { key: 'p2', nickname: 'Петро', score: 0 }],
      events: [{ kind: 'manual', nickname: 'Оля', from: 'wrong', to: 'correct' }],
    },
    {
      index: 1,
      roundIndex: 0,
      question: river,
      price: 200,
      multiplier: 2,
      rows: [row({ answer: { type: 'text', value: 'Дніпро' }, timeMs: 6500, verdict: 'correct', points: 400 }), row({ key: 'p2', nickname: 'Петро', answer: { type: 'text', value: 'Дністер' }, timeMs: 9000, verdict: 'wrong' })],
      scores: [{ key: 'p1', nickname: 'Оля', score: 500 }, { key: 'p2', nickname: 'Петро', score: 0 }],
      events: [],
    },
    {
      index: 2,
      roundIndex: 1,
      question: mountain,
      price: 300,
      multiplier: 1,
      rows: [row({ answer: { type: 'single', optionId: 'a' }, timeMs: 3000, verdict: 'correct', points: 300 }), row({ key: 'p2', nickname: 'Петро', answer: { type: 'single', optionId: 'b' }, timeMs: 5000, verdict: 'wrong' })],
      scores: [{ key: 'p1', nickname: 'Оля', score: 800 }, { key: 'p2', nickname: 'Петро', score: 0 }],
      events: [],
    },
  ],
};

let urls: string[];
const stub = (status: number, data: unknown) => {
  urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(String(url));
      return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  return <p data-testid="where">{useLocation().search}</p>;
}

const open = (search = '') =>
  render(
    <MemoryRouter initialEntries={[`/admin/games/${replay.id}/replay${search}`]}>
      <Routes>
        <Route
          path="/admin/games/:id/replay"
          element={
            <>
              <AdminReplay />
              <Where />
            </>
          }
        />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

const rowOf = (name: string) => screen.getAllByRole('listitem').find((item) => item.classList.contains('replay-row') && within(item).queryByText(name) !== null)!;

describe('AdminReplay (65)', () => {
  it('shows the first step with the question, price, correct answer, rows and events', async () => {
    stub(200, replay);
    open();
    expect(await screen.findByRole('heading', { name: 'Повтор: «Осінній квіз»', level: 2 })).toBeTruthy();
    expect(urls).toEqual([`/api/admin/games/${replay.id}/replay`]);
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Столиця Франції?', level: 3 })).toBeTruthy();
    expect(screen.getByText(t('type_text'), { exact: false })).toBeTruthy();
    expect(screen.getByText('Ціна: 100', { exact: false })).toBeTruthy();
    expect(screen.getByText('Правильна відповідь: Париж')).toBeTruthy();
    const olya = rowOf('Оля');
    expect(within(olya).getByText('Париж')).toBeTruthy();
    expect(within(olya).getByText('4,0')).toBeTruthy();
    expect(within(olya).getByText('зараховано (вручну)')).toBeTruthy();
    expect(within(olya).getAllByText('100')).toHaveLength(2);
    const petro = rowOf('Петро');
    expect(within(petro).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(petro).getByText('0', { selector: '.replay-score *' })).toBeTruthy();
    const events = document.querySelector('ul.replay-events')!;
    expect(within(events as HTMLElement).getByText('Оля: ведучий вирішив вручну — не зараховано → зараховано')).toBeTruthy();
    // Рахунок усім нульовий і подій до гри немає — блоку «Перед першим запитанням» немає.
    expect(screen.queryByText('Перед першим запитанням')).toBeNull();
    expect(screen.queryByText(t('adminReplayNotRecorded'))).toBeNull();
  });

  it('next, back and the jump list move between steps and keep the step in the address', async () => {
    stub(200, replay);
    open();
    await screen.findByText('Запитання 1 з 3');
    const prev = screen.getByRole('button', { name: '← Назад' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Далі →' }) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    fireEvent.click(next);
    expect(screen.getByText('Запитання 2 з 3')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('?q=2');
    expect(screen.getByText('Ціна: 200 ×2', { exact: false })).toBeTruthy();
    expect(screen.getByText(t('adminReplayNoEvents'))).toBeTruthy();
    fireEvent.click(prev);
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('?q=1');
    const jump = screen.getByRole('combobox', { name: 'Запитання' }) as HTMLSelectElement;
    const groups = jump.querySelectorAll('optgroup');
    expect([...groups].map((group) => group.label)).toEqual(['Раунд 1. Розминка', 'Раунд 2. Фінал']);
    expect(groups[0]!.querySelectorAll('option')).toHaveLength(2);
    fireEvent.change(jump, { target: { value: '2' } });
    expect(screen.getByText('Запитання 3 з 3')).toBeTruthy();
    expect(screen.getByTestId('where').textContent).toBe('?q=3');
    expect(next.disabled).toBe(true);
    expect(within(rowOf('Петро')).getByText('Піп Іван')).toBeTruthy();
  });

  it('a wrong step in the address opens the first step', async () => {
    stub(200, replay);
    open('?q=99');
    expect(await screen.findByText('Запитання 1 з 3')).toBeTruthy();
    cleanup();
    open('?q=2');
    expect(await screen.findByText('Запитання 2 з 3')).toBeTruthy();
  });

  it('an old game shows the note and dashes', async () => {
    const old: GameReplay = { ...replay, recorded: false, recordedFrom: null, steps: replay.steps.map((step, index) => (index === 0 ? { ...step, events: [{ kind: 'manual', nickname: 'Оля', from: null, to: 'correct' }] } : step)) };
    stub(200, old);
    open();
    expect(await screen.findByText(t('adminReplayNotRecorded'))).toBeTruthy();
    expect(screen.getByText('Оля: ведучий вирішив вручну — — → зараховано')).toBeTruthy();
  });

  it('the start block shows carried points', async () => {
    const carried: GameReplay = {
      ...replay,
      start: { scores: [{ key: 'p1', nickname: 'Оля', score: 300 }, { key: 'p2', nickname: 'Петро', score: 0 }], events: [{ kind: 'adjustment', nickname: 'Оля', source: 'carry', points: 300 }] },
    };
    stub(200, carried);
    open();
    const heading = await screen.findByRole('heading', { name: 'Перед першим запитанням', level: 3 });
    const block = heading.closest('section')!;
    expect(within(block).getByText('Оля: +300 — Перенесено з попередньої гри')).toBeTruthy();
    expect(within(block).getByText('300')).toBeTruthy();
  });

  it('the events heading sits under the step heading and event lines follow the page direction', async () => {
    stub(200, replay);
    open();
    expect(await screen.findByRole('heading', { name: 'Події', level: 4 })).toBeTruthy();
    const line = document.querySelector('ul.replay-events li')!;
    expect(line.hasAttribute('dir')).toBe(false);
  });

  it('focus stays on the step buttons when one becomes disabled at an end', async () => {
    stub(200, { ...replay, steps: replay.steps.slice(0, 2) });
    open();
    await screen.findByText('Запитання 1 з 2');
    const prev = screen.getByRole('button', { name: '← Назад' }) as HTMLButtonElement;
    const next = screen.getByRole('button', { name: 'Далі →' }) as HTMLButtonElement;
    next.focus();
    fireEvent.click(next);
    expect(next.disabled).toBe(true);
    expect(document.activeElement).toBe(prev);
    fireEvent.click(prev);
    expect(prev.disabled).toBe(true);
    expect(document.activeElement).toBe(next);
  });

  it('scores are found by the participant key, not the nickname', async () => {
    const twins: GameReplay = {
      ...replay,
      steps: [
        {
          ...replay.steps[0]!,
          rows: [row({ key: 'p1', nickname: 'Видалений гравець', points: 100, verdict: 'correct' }), row({ key: 'p2', nickname: 'Видалений гравець', verdict: 'wrong' })],
          scores: [
            { key: 'p1', nickname: 'Видалений гравець', score: 700 },
            { key: 'p2', nickname: 'Видалений гравець', score: 55 },
          ],
          events: [],
        },
      ],
    };
    stub(200, twins);
    open();
    await screen.findByText('Запитання 1 з 1');
    const cells = [...document.querySelectorAll('.replay-row .replay-score .replay-value')].map((cell) => cell.textContent);
    expect(cells).toEqual(['700', '55']);
  });

  it('several attempts show their number and the score only on the last one; a wager is shown', async () => {
    const attempts: GameReplay = {
      ...replay,
      steps: [
        {
          ...replay.steps[0]!,
          rows: [row({ attempt: 0, verdict: 'wrong', wager: 300 }), row({ attempt: 1, verdict: 'correct', points: 100 }), row({ key: 'p2', nickname: 'Петро' })],
          events: [],
        },
      ],
    };
    stub(200, attempts);
    open();
    await screen.findByText('Запитання 1 з 1');
    const rows = [...document.querySelectorAll('.replay-row')] as HTMLElement[];
    expect(within(rows[0]!).getByText('спроба 1')).toBeTruthy();
    expect(within(rows[1]!).getByText('спроба 2')).toBeTruthy();
    expect(within(rows[2]!).queryByText(/спроба/)).toBeNull();
    expect(rows[0]!.querySelector('.replay-score')).toBeNull();
    expect(rows[1]!.querySelector('.replay-score .replay-value')?.textContent).toBe('100');
    expect(within(rows[0]!).getByText('Ставка: 300')).toBeTruthy();
  });

  it('steps before the recording started carry the note', async () => {
    stub(200, { ...replay, recordedFrom: 1 });
    open();
    expect(await screen.findByText(t('adminReplayNotRecordedStep'))).toBeTruthy();
    expect(screen.queryByText(t('adminReplayNotRecorded'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Далі →' }));
    expect(screen.queryByText(t('adminReplayNotRecordedStep'))).toBeNull();
  });

  it('a saved or aborted game says it stopped early', async () => {
    stub(200, { ...replay, status: 'aborted' });
    open();
    expect(await screen.findByText('Гра: перервано')).toBeTruthy();
    cleanup();
    stub(200, { ...replay, status: 'saved', finishedAt: null });
    open();
    expect(await screen.findByText('Гра: не завершена')).toBeTruthy();
    cleanup();
    stub(200, replay);
    open();
    await screen.findByText('Запитання 1 з 3');
    expect(screen.queryByText(/^Гра: /)).toBeNull();
  });

  it('a game without steps says so', async () => {
    stub(200, { ...replay, status: 'aborted', steps: [] });
    open();
    expect(await screen.findByText(t('adminReplayNoSteps'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Далі →' })).toBeNull();
  });

  it('a running game error is shown with retry', async () => {
    stub(409, { error: 'replay_running' });
    open();
    expect(await screen.findByText('Гра ще йде — повтор буде після її завершення.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← До гри' }).getAttribute('href')).toBe(`/admin/games/${replay.id}`);
    stub(200, replay);
    fireEvent.click(screen.getByRole('button', { name: t('prizesRetry') }));
    expect(await screen.findByText('Запитання 1 з 3')).toBeTruthy();
  });

  it('goes home on 404', async () => {
    stub(404, { error: 'not_found' });
    open();
    expect(await screen.findByText('головна')).toBeTruthy();
  });
});
