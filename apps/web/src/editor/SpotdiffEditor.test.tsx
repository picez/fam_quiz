// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SPOT_DEFAULT_R, type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion, type SpotdiffQuestion } from './draft';
import { SpotdiffEditor } from './SpotdiffEditor';
import * as imageField from './ImageField';

const ORIGINAL = '/uploads/aaaaaaaaaaaaaaaaaaaa.png';
const CHANGED = '/uploads/bbbbbbbbbbbbbbbbbbbb.png';
const OTHER = '/uploads/cccccccccccccccccccc.png';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Рамка 400×200: співвідношення 2, дотик у (200, 100) — центр.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
});

function Harness({ initial, spy }: { initial: SpotdiffQuestion; spy: (q: SpotdiffQuestion) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <SpotdiffEditor
      question={question}
      onChange={(next: Question) => {
        spy(next as SpotdiffQuestion);
        setQuestion(next as SpotdiffQuestion);
      }}
    />
  );
}

const view = (patch: Partial<SpotdiffQuestion> = {}) => {
  const spy = vi.fn<(q: SpotdiffQuestion) => void>();
  const initial = { ...(newQuestion('spotdiff') as SpotdiffQuestion), original: ORIGINAL, changed: CHANGED, aspect: 2, ...patch };
  render(<Harness initial={initial} spy={spy} />);
  return { last: () => spy.mock.calls.at(-1)![0], calls: spy.mock.calls };
};
const board = () => screen.getByRole('group', { name: t('spotdiffMarkHint') });
const circle = (x: number, y: number, r = 0.06) => ({ x, y, r });

describe('SpotdiffEditor', () => {
  it('a tap on the changed picture adds a circle', () => {
    const { last } = view();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 200, clientY: 100 });
    expect(last().spots).toEqual([{ x: 0.5, y: 0.5, r: 0.06 }]);
    expect(screen.getByText(t('spotdiffCount', { count: 1, max: 10 }))).toBeTruthy();
  });

  it('dragging on a new empty spot sets the radius from the touch point', () => {
    const { last } = view();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, clientY: 100 });
    // 60 px по ширині 400 — 0,15 ширини.
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 260, clientY: 100 });
    expect(last().spots[0]!.r).toBeCloseTo(0.15);
  });

  it('dragging resizes the circle', () => {
    const { last } = view({ spots: [circle(0.5, 0.5)] });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 240, clientY: 100 });
    expect(last().spots).toHaveLength(1);
    expect(last().spots[0]!.r).toBeCloseTo(0.1);
    // Далі за 0,25 ширини радіус стоїть на межі.
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 380, clientY: 100 });
    expect(last().spots[0]!.r).toBeCloseTo(0.25);
    fireEvent.pointerUp(board(), { pointerId: 1 });
  });

  it('a short tap on a circle only selects it', () => {
    const { calls } = view({ spots: [circle(0.5, 0.5, 0.1)] });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    expect(calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: t('spotdiffRemove') }).hasAttribute('disabled')).toBe(false);
  });

  it('a tap with a 2 px drift places a circle with the default radius', () => {
    const { last } = view();
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 202, clientY: 100 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 202, clientY: 100 });
    expect(last().spots).toEqual([{ x: 0.5, y: 0.5, r: SPOT_DEFAULT_R }]);
  });

  it('a tap with a drift on an existing circle only selects it', () => {
    const { calls } = view({ spots: [circle(0.5, 0.5, 0.1)] });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 212, clientY: 101 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 212, clientY: 101 });
    expect(calls).toHaveLength(0);
    expect(screen.getByRole('button', { name: t('spotdiffRemove') }).hasAttribute('disabled')).toBe(false);
  });

  it('a 40 px drag changes the radius', () => {
    const { last } = view({ spots: [circle(0.5, 0.5, 0.05)] });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    fireEvent.pointerMove(board(), { pointerId: 1, clientX: 250, clientY: 100 });
    expect(last().spots[0]!.r).toBeCloseTo(0.125);
  });

  it('an eleventh circle is refused', () => {
    const ten = Array.from({ length: 10 }, (_, i) => circle(0.05 + i * 0.09, 0.1, 0.02));
    const { calls } = view({ spots: ten });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 200, clientY: 180 });
    expect(calls).toHaveLength(0);
    expect(screen.getByText(t('spotdiffMax', { max: 10 }))).toBeTruthy();
  });

  it('remove deletes the selected circle', () => {
    const { last } = view({ spots: [circle(0.2, 0.5, 0.05), circle(0.8, 0.5, 0.05)] });
    expect(screen.getByRole('button', { name: t('spotdiffRemove') }).hasAttribute('disabled')).toBe(true);
    // Дотик у центр другого кола виділяє його.
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 320, clientY: 100 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 320, clientY: 100 });
    fireEvent.click(screen.getByRole('button', { name: t('spotdiffRemove') }));
    expect(last().spots).toEqual([circle(0.2, 0.5, 0.05)]);
  });

  it('the timer floor is 25', () => {
    const { last, calls } = view();
    const field = screen.getByRole('textbox', { name: t('timeLimit') });
    fireEvent.change(field, { target: { value: '24' } });
    expect(calls).toHaveLength(0);
    fireEvent.change(field, { target: { value: '25' } });
    expect(last().timeLimit).toBe(25);
    fireEvent.change(field, { target: { value: '600' } });
    expect(last().timeLimit).toBe(600);
  });
});

describe('SpotdiffEditor uploads', () => {
  const upload = (...urls: string[]) => {
    const queue = [...urls];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ url: queue.shift() }), { status: 201 })));
  };
  const pick = (label: string) => {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  };

  it('a changed picture with another aspect is refused', async () => {
    const measure = vi.spyOn(imageField, 'measureAspect').mockResolvedValueOnce(1.5).mockResolvedValueOnce(1.6);
    upload(ORIGINAL, CHANGED);
    const { calls } = view({ original: '', changed: '', aspect: 4 / 3 });
    pick(t('spotdiffOriginal'));
    await waitFor(() => expect(calls.at(-1)![0]).toMatchObject({ original: ORIGINAL, aspect: 1.5 }));
    pick(t('spotdiffChanged'));
    await screen.findByText(t('spotdiffAspectMismatch'));
    expect(measure).toHaveBeenCalledTimes(2);
    expect(calls.at(-1)![0]!.changed).toBe('');
  });

  it('a changed picture within the tolerance is kept', async () => {
    vi.spyOn(imageField, 'measureAspect').mockResolvedValueOnce(1.5).mockResolvedValueOnce(1.51);
    upload(ORIGINAL, CHANGED);
    const { calls } = view({ original: '', changed: '', aspect: 4 / 3 });
    pick(t('spotdiffOriginal'));
    await waitFor(() => expect(calls.at(-1)![0]).toMatchObject({ original: ORIGINAL }));
    pick(t('spotdiffChanged'));
    await waitFor(() => expect(calls.at(-1)![0]).toMatchObject({ changed: CHANGED }));
  });

  it('a new original with another aspect clears the second picture and the circles', async () => {
    vi.spyOn(imageField, 'measureAspect').mockResolvedValueOnce(1);
    upload(OTHER);
    const { calls } = view({ spots: [circle(0.5, 0.5)] });
    pick(t('spotdiffOriginal'));
    await waitFor(() => expect(calls.at(-1)![0]).toMatchObject({ original: OTHER, aspect: 1, changed: '', spots: [] }));
  });

  it('a new original with the same aspect keeps the circle selection', async () => {
    vi.spyOn(imageField, 'measureAspect').mockResolvedValueOnce(2);
    upload(OTHER);
    const { calls } = view({ spots: [circle(0.5, 0.5, 0.1)] });
    fireEvent.pointerDown(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    fireEvent.pointerUp(board(), { pointerId: 1, clientX: 210, clientY: 100 });
    pick(t('spotdiffOriginal'));
    await waitFor(() => expect(calls.at(-1)![0]).toMatchObject({ original: OTHER, changed: CHANGED }));
    expect(screen.getByRole('button', { name: t('spotdiffRemove') }).hasAttribute('disabled')).toBe(false);
  });

  it('a changed picture before the original asks for the original first', async () => {
    vi.spyOn(imageField, 'measureAspect').mockResolvedValueOnce(2);
    upload(CHANGED);
    view({ original: '', changed: '' });
    pick(t('spotdiffChanged'));
    await screen.findByText(t('spotdiffNeedOriginal'));
  });
});
