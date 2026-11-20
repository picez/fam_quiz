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

const row = (over: Partial<ReplayRow>): ReplayRow => ({ nickname: 'Оля', answeredBy: null, attempt: 0, answer: null, spare: null, timeMs: null, verdict: 'none', manual: false, points: 0, wager: null, awayMs: null, ...over });

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
  start: { scores: [{ nickname: 'Оля', score: 0 }, { nickname: 'Петро', score: 0 }], events: [] },
  steps: [
    {
      index: 0,
      roundIndex: 0,
      question: capital,
      price: 100,
      multiplier: 1,
      rows: [row({ answer: { type: 'text', value: 'Париж' }, timeMs: 4000, verdict: 'correct', manual: true, points: 100 }), row({ nickname: 'Петро' })],
      scores: [{ nickname: 'Оля', score: 100 }, { nickname: 'Петро', score: 0 }],
      events: [{ kind: 'manual', nickname: 'Оля', from: 'wrong', to: 'correct' }],
    },
    {
      index: 1,
      roundIndex: 0,
      question: river,
      price: 200,
      multiplier: 2,
      rows: [row({ answer: { type: 'text', value: 'Дніпро' }, timeMs: 6500, verdict: 'correct', points: 400 }), row({ nickname: 'Петро', answer: { type: 'text', value: 'Дністер' }, timeMs: 9000, verdict: 'wrong' })],
      scores: [{ nickname: 'Оля', score: 500 }, { nickname: 'Петро', score: 0 }],
      events: [],
    },
    {
      index: 2,
      roundIndex: 1,
      question: mountain,
      price: 300,
      multiplier: 1,
      rows: [row({ answer: { type: 'single', optionId: 'a' }, timeMs: 3000, verdict: 'correct', points: 300 }), row({ nickname: 'Петро', answer: { type: 'single', optionId: 'b' }, timeMs: 5000, verdict: 'wrong' })],
      scores: [{ nickname: 'Оля', score: 800 }, { nickname: 'Петро', score: 0 }],
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
    const old: GameReplay = { ...replay, recorded: false, steps: replay.steps.map((step, index) => (index === 0 ? { ...step, events: [{ kind: 'manual', nickname: 'Оля', from: null, to: 'correct' }] } : step)) };
    stub(200, old);
    open();
    expect(await screen.findByText(t('adminReplayNotRecorded'))).toBeTruthy();
    expect(screen.getByText('Оля: ведучий вирішив вручну — — → зараховано')).toBeTruthy();
  });

  it('the start block shows carried points', async () => {
    const carried: GameReplay = {
      ...replay,
      start: { scores: [{ nickname: 'Оля', score: 300 }, { nickname: 'Петро', score: 0 }], events: [{ kind: 'adjustment', nickname: 'Оля', source: 'carry', points: 300 }] },
    };
    stub(200, carried);
    open();
    const heading = await screen.findByRole('heading', { name: 'Перед першим запитанням', level: 3 });
    const block = heading.closest('section')!;
    expect(within(block).getByText('Оля: +300 — Перенесено з попередньої гри')).toBeTruthy();
    expect(within(block).getByText('300')).toBeTruthy();
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
