// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { jigsawEdgeCount, type Question } from '@quiz/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { newQuestion, type JigsawQuestion } from './draft';
import { JigsawEditor } from './JigsawEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PHOTO = '/uploads/0123456789abcdef0123.jpg';

function Harness({ initial, spy }: { initial: JigsawQuestion; spy: (q: JigsawQuestion) => void }) {
  const [question, setQuestion] = useState(initial);
  return (
    <JigsawEditor
      question={question}
      onChange={(next) => {
        spy(next);
        setQuestion(next);
      }}
    />
  );
}

const view = (patch: Partial<JigsawQuestion> = {}) => {
  const spy = vi.fn<(q: JigsawQuestion) => void>();
  const initial = { ...(newQuestion('jigsaw') as Extract<Question, { type: 'jigsaw' }>), photo: PHOTO, ...patch };
  render(<Harness initial={initial} spy={spy} />);
  return { initial, last: () => spy.mock.calls.at(-1)![0], calls: spy.mock.calls };
};
const slider = () => screen.getByRole('slider');

describe('JigsawEditor', () => {
  // jsdom не завантажує зображень: розміри фото задає тест.
  beforeEach(() => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1000);
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  });

  it('shows the grid for the count', () => {
    const { last } = view();
    expect(screen.getByText(t('jigsawPieces', { cols: 4, rows: 3, n: 12 }))).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '16:9' }));
    fireEvent.change(slider(), { target: { value: '7' } });
    expect(screen.getByText(t('jigsawPieces', { cols: 4, rows: 2, n: 8 }))).toBeTruthy();
    expect(last()).toMatchObject({ aspect: '16:9', rows: 2, cols: 4 });
    expect(last().tabs).toHaveLength(jigsawEdgeCount(2, 4));
    // Повзунок лишається на бажаному числі, щоб можна було йти далі.
    expect((slider() as HTMLInputElement).value).toBe('7');
  });

  it('asks for a photo before it has one', () => {
    view({ photo: '' });
    expect(screen.getByText(t('jigsawPhotoNeed'))).toBeTruthy();
    expect(screen.queryByLabelText(t('jigsawCrop'))).toBeNull();
  });

  it('dragging the frame moves the focus', () => {
    const { last } = view({ aspect: '1:1', rows: 3, cols: 3, tabs: '0'.repeat(jigsawEdgeCount(3, 3)) });
    fireEvent.load(document.querySelector('.jigsaw-editor-crop img')!);
    const frame = screen.getByLabelText(t('jigsawCrop'));
    fireEvent.pointerDown(frame, { pointerId: 1, clientX: 100, clientY: 50 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 140, clientY: 50 });
    // Фото 1000×500 у 1:1: рамка 500×500, запас по ширині — половина; 40 px із 400 · 0,5 = 0,2.
    expect(last().focus.x).toBeCloseTo(0.7, 5);
    expect(last().focus.y).toBe(0.5);
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 400, clientY: 50 });
    expect(last().focus.x).toBe(1);
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 0, clientY: 50 });
    expect(last().focus.x).toBe(1);
  });

  it('moves the frame with the arrow keys', () => {
    const { last } = view({ aspect: '1:1', rows: 3, cols: 3, tabs: '0'.repeat(jigsawEdgeCount(3, 3)) });
    fireEvent.load(document.querySelector('.jigsaw-editor-crop img')!);
    const frame = screen.getByLabelText(t('jigsawCrop'));
    fireEvent.keyDown(frame, { key: 'ArrowRight' });
    expect(last().focus.x).toBeCloseTo(0.55, 5);
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    fireEvent.keyDown(frame, { key: 'ArrowLeft' });
    expect(last().focus.x).toBeCloseTo(0.45, 5);
  });

  it('another shape keeps the grid', () => {
    const { initial, last } = view();
    fireEvent.click(screen.getByRole('button', { name: t('jigsawNewShape') }));
    expect(last()).toMatchObject({ rows: initial.rows, cols: initial.cols, seed: initial.seed + 1 });
    expect(last().tabs).toHaveLength(initial.tabs.length);
    expect(last().tabs).not.toBe(initial.tabs);
  });

  it('switches the finished picture for players', () => {
    const { last } = view();
    fireEvent.click(screen.getByLabelText(t('jigsawPreviewLabel')));
    expect(last().preview).toBe(false);
  });

  it('the timer floor is 25', () => {
    const { calls, last } = view();
    const field = screen.getByLabelText(t('timeLimit')) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '24' } });
    expect(calls).toHaveLength(0);
    fireEvent.change(field, { target: { value: '25' } });
    expect(last().timeLimit).toBe(25);
    fireEvent.change(field, { target: { value: '601' } });
    expect(last().timeLimit).toBe(25);
    fireEvent.change(field, { target: { value: '90' } });
    expect(last().timeLimit).toBe(90);
    fireEvent.change(field, { target: { value: '5' } });
    fireEvent.blur(field);
    expect(field.value).toBe('90');
  });
});
