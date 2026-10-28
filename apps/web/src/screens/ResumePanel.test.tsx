// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeLobby, ResumeOption } from '@quiz/shared';
import { resumeOptions } from '../api';
import { emptyDraft, type ResumeDraft } from '../resume';
import { ResumePanel } from './ResumePanel';

vi.mock('../api', () => ({ resumeOptions: vi.fn() }));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const info: ResumeLobby = {
  rounds: [
    { title: 'Розминка', type: 'classic' },
    { title: 'Річки', type: 'classic' },
    { title: 'Гори', type: 'classic' },
  ],
  participants: [
    { id: 'p1', nickname: 'Оля' },
    { id: 'p2', nickname: 'Петро' },
    { id: 'p3', nickname: 'Тарас' },
  ],
};

const option = (over: Partial<ResumeOption> = {}): ResumeOption => ({
  gameId: 'g1',
  startedAt: '2026-10-27T17:40:00.000Z',
  status: 'aborted',
  questionsPlayed: 4,
  questionCount: 9,
  autopilot: false,
  roundIndex: 1,
  scores: [
    { nickname: 'оля', score: 42_434 },
    { nickname: 'Петро', score: 1200 },
    { nickname: 'Іра', score: 50 },
  ],
  ...over,
});

let latest: ResumeDraft = emptyDraft();

function Harness({ initial = emptyDraft() }: { initial?: ResumeDraft }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  return (
    <ResumePanel
      code="123456"
      info={info}
      draft={draft}
      onChange={(next) => {
        latest = next;
        setDraft(next);
      }}
    />
  );
}

const panel = () => document.querySelector('details.resume-panel') as HTMLDetailsElement;

function unfold() {
  panel().open = true;
  fireEvent(panel(), new Event('toggle'));
}

const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;

describe('ResumePanel', () => {
  it('is folded by default; unfolding shows the round list and fields with 0', () => {
    render(<Harness />);
    expect(panel().open).toBe(false);
    expect(panel().querySelector('summary')!.textContent).toBe('Продовжити попередню гру');
    unfold();
    expect(latest.open).toBe(true);
    const select = screen.getByRole('combobox', { name: 'Почати з раунду' }) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Раунд 1 · Розминка', 'Раунд 2 · Річки', 'Раунд 3 · Гори']);
    expect(field('Оля').value).toBe('0');
    expect(field('Тарас').type).toBe('number');
    expect(field('Тарас').getAttribute('inputmode')).toBeNull();
    expect(screen.getByText('Старт: Раунд 1 · Розминка. Перенесені бали: 0 з 3.')).toBeTruthy();
    expect(screen.getByText('Хто зайде пізніше, почне з 0.')).toBeTruthy();
  });

  it('changing the round and a field updates the draft and the summary', () => {
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Почати з раунду' }), { target: { value: '2' } });
    fireEvent.change(field('Петро'), { target: { value: '1200' } });
    expect(latest).toEqual({ open: true, roundIndex: 2, points: { p2: '1200' } });
    expect(screen.getByText('Старт: Раунд 3 · Гори. Перенесені бали: 1 з 3.')).toBeTruthy();
  });

  it('one previous game fills right away and names the unmatched', async () => {
    vi.mocked(resumeOptions).mockResolvedValue({ ok: true, data: [option()] });
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Підставити з попередньої гри' }));
    expect(resumeOptions).toHaveBeenCalledWith('123456');
    expect(await screen.findByText(/^Підставлено гру від /)).toBeTruthy();
    expect(field('Оля').value).toBe('42434');
    expect(field('Петро').value).toBe('1200');
    expect(field('Тарас').value).toBe('0');
    expect(latest.roundIndex).toBe(1);
    expect(screen.getByText('Не знайдено в тій грі, лишається 0: Тарас')).toBeTruthy();
    expect(screen.getByText(/Усе можна змінити\.$/)).toBeTruthy();
  });

  it('shows a loading line with a disabled button while looking', async () => {
    let resolve: (value: Awaited<ReturnType<typeof resumeOptions>>) => void = () => {};
    vi.mocked(resumeOptions).mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    const fill = screen.getByRole('button', { name: 'Підставити з попередньої гри' }) as HTMLButtonElement;
    fireEvent.click(fill);
    expect(screen.getByText('Шукаємо попередні ігри…')).toBeTruthy();
    expect(fill.disabled).toBe(true);
    resolve({ ok: true, data: [] });
    expect(await screen.findByText('Попередніх ігор цієї вікторини не знайдено.')).toBeTruthy();
    expect(fill.disabled).toBe(false);
  });

  it('several games: a pick newest first; a tap fills from that game and hides the pick', async () => {
    const older = option({ gameId: 'g2', startedAt: '2026-10-20T17:40:00.000Z', roundIndex: 7, questionsPlayed: 2, scores: [{ nickname: 'Тарас', score: 300 }] });
    vi.mocked(resumeOptions).mockResolvedValue({ ok: true, data: [option(), older] });
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Підставити з попередньої гри' }));
    const pick = (await screen.findByText('Яку гру продовжити?')).closest('section.resume-pick') as HTMLElement;
    const buttons = within(pick).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toMatch(/27 жовтня 2026.* · 4 з 9 запитань · далі Раунд 2 · Річки$/);
    expect(buttons[1].textContent).toMatch(/20 жовтня 2026.* · 2 з 9 запитань · далі Раунд 3 · Гори$/);
    fireEvent.click(buttons[1]);
    expect(document.querySelector('section.resume-pick')).toBeNull();
    expect(field('Тарас').value).toBe('300');
    expect(field('Оля').value).toBe('0');
    expect(latest.roundIndex).toBe(2);
    expect(screen.getByText('Не знайдено в тій грі, лишається 0: Оля, Петро')).toBeTruthy();
  });

  it('no games or an error say nothing was found, manual entry still works', async () => {
    vi.mocked(resumeOptions).mockResolvedValue({ ok: false, error: 'game_not_found' });
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Підставити з попередньої гри' }));
    expect(await screen.findByText('Попередніх ігор цієї вікторини не знайдено.')).toBeTruthy();
    fireEvent.change(field('Оля'), { target: { value: '5' } });
    expect(latest.points).toEqual({ p1: '5' });
  });

  it('a bad field says what is allowed', async () => {
    render(<Harness initial={{ ...emptyDraft(), open: true }} />);
    fireEvent.change(field('Оля'), { target: { value: '10000000' } });
    await waitFor(() => expect(screen.getByText('Ціле число від −9 999 999 до 9 999 999')).toBeTruthy());
    expect(field('Оля').getAttribute('aria-invalid')).toBe('true');
  });
});
