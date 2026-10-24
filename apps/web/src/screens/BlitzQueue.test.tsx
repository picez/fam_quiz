// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BlitzRow, PublicQuestion } from '@quiz/shared';
import { BlitzQueue } from './BlitzQueue';

afterEach(cleanup);

const question: PublicQuestion = {
  type: 'single',
  text: 'Столиця?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 100,
  right: [],
  chain: null,
  sort: null,
  orderLabels: null, slider: null, audio: null, reveal: null,
  choices: [
    { id: 'a', text: 'Львів' },
    // Варіант-картинка підписується літерою показу.
    { id: 'b', text: '', imageUrl: 'https://img.example/b.png' },
  ],
};

const olya: BlitzRow = { playerId: 'p1', nickname: 'Оля', timeMs: 2400, grade: 'wrong', answer: null };
const petro: BlitzRow = { playerId: 'p2', nickname: 'Петро', timeMs: 3100, grade: null, answer: { type: 'single', optionId: 'b' } };
const none = new Set<string>();

const items = () => [...document.querySelectorAll('.blitz-queue li')];

describe('BlitzQueue', () => {
  it('shows rank, name, time and verdict, and the pick only when it is given', () => {
    render(<BlitzQueue rows={[olya, petro]} reserve={2} question={question} blinking={none} />);
    const [first, second] = items();
    expect(first.querySelector('.rank')?.textContent).toBe('1');
    expect(first.querySelector('.name')?.textContent).toBe('Оля');
    expect(first.querySelector('.time')?.textContent).toBe('2,4 с');
    expect(first.querySelector('.blitz-mark')?.textContent).toBe('✗');
    expect(first.querySelector('.blitz-mark')?.getAttribute('aria-label')).toBe('неправильно');
    expect(first.querySelector('.given')).toBeNull();
    expect(second.querySelector('.given')?.textContent).toBe('Картинка B');
    expect(second.querySelector('.blitz-mark')?.textContent).toBe('Перевіряємо');
    expect(screen.getByRole('list', { name: 'Черга відповідей' })).toBeTruthy();
  });

  it('marks the rows left unchecked after the close and blinks a fresh verdict', () => {
    const correct: BlitzRow = { ...olya, playerId: 'p3', grade: 'correct' };
    render(<BlitzQueue rows={[correct, { ...petro, answer: null }]} reserve={2} question={question} blinking={new Set(['p3'])} closed />);
    const [first, second] = items();
    expect(first.querySelector('.blitz-mark')?.className).toContain('is-correct');
    expect(first.querySelector('.blitz-mark')?.className).toContain('is-blinking');
    expect(second.querySelector('.blitz-mark')?.textContent).toBe('не перевірено');
  });

  it('reserves its rows and keeps one line per row', () => {
    render(<BlitzQueue rows={[]} reserve={9} question={question} blinking={none} />);
    const list = document.querySelector('ol.blitz-queue') as HTMLElement;
    expect(list.className).toContain('is-reserved');
    expect(list.getAttribute('style')).toContain('--rows: 6');
    expect(screen.getByText('Відповідей ще немає').closest('li')?.className).toBe('is-empty');
  });

  it('the host head is orange', () => {
    render(<BlitzQueue rows={[olya, petro]} reserve={2} question={question} blinking={none} highlightHead />);
    expect(items()[1].className).toContain('is-head');
    expect(items()[1].className).toContain('is-pending');
    expect(items()[0].className).toBe('');
  });
});
