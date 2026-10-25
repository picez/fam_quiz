// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEBUFF_KINDS, type HostLive, type HostView, type LiveRow, type Question } from '@quiz/shared';
import { LiveAnswers } from './LiveAnswers';

afterEach(cleanup);

const text: Question = { id: 'q2', type: 'text', text: 'Перлина біля моря?', imageUrl: null, video: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
const slider: Question = { id: 'q3', type: 'slider', text: 'Скільки?', imageUrl: null, video: null, timeLimit: 20, points: 1000, min: 0, max: 100, step: 1, correct: 50, tolerance: 0, unit: '%' } as unknown as Question;

const base = (over: Partial<HostView> = {}): HostView =>
  ({
    role: 'host',
    phase: 'question',
    blitz: null,
    question: { choices: [] },
    correct: text,
    ...over,
  }) as unknown as HostView;

const row = (over: Partial<LiveRow> = {}): LiveRow => ({
  id: 'p1',
  nickname: 'Оля',
  connected: true,
  answered: false,
  answer: null,
  timeMs: null,
  verdict: null,
  awaiting: false,
  buff: null,
  spare: null,
  clue: null,
  actor: null,
  draft: null,
  progress: null,
  ...over,
});

const live = (rows: LiveRow[], over: Partial<HostLive> = {}): HostLive => ({
  kind: 'answers',
  answered: rows.filter((r) => r.answered).length,
  total: rows.length,
  rows,
  aside: null,
  ...over,
});

const ans = (value: string) => ({ type: 'text' as const, value });
const show = (rows: LiveRow[], view = base(), over: Partial<HostLive> = {}, extra: { blitz?: React.ReactNode; compact?: boolean } = {}) =>
  render(<LiveAnswers view={view} live={live(rows, over)} {...extra} />);

describe('LiveAnswers', () => {
  void DEBUFF_KINDS;

  it('shows the header, waiting chips with the offline one grey, and the answered row', () => {
    show([
      row({ answered: true, answer: ans('Одеса'), timeMs: 4200, verdict: 'correct' }),
      row({ id: 'p2', nickname: 'Петро' }),
      row({ id: 'p3', nickname: 'Іра', connected: false }),
    ]);
    expect(screen.getByText('Відповіли 1 з 3')).toBeTruthy();
    expect(screen.getByText('Чекаємо:')).toBeTruthy();
    const chips = document.querySelectorAll('.live-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toBe('Петро');
    expect(chips[1].classList.contains('is-offline')).toBe(true);
    expect(chips[1].textContent).toContain('поза зв’язком');
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Оля');
    expect(rows[0].textContent).toContain('Одеса');
    expect(rows[0].textContent).toContain('4,2');
    expect(within(rows[0] as HTMLElement).getByText('правильно').classList.contains('is-correct')).toBe(true);
  });

  it('says "Не відповіли" on a locked question', () => {
    show([row()], base({ phase: 'locked' }));
    expect(screen.getByText('Не відповіли:')).toBeTruthy();
  });

  it('shows partial, wrong and awaiting verdicts', () => {
    show([
      row({ answered: true, answer: ans('а'), verdict: 'partial' }),
      row({ id: 'p2', nickname: 'Петро', answered: true, answer: ans('б'), verdict: 'wrong' }),
      row({ id: 'p3', nickname: 'Іра', answered: true, answer: ans('в'), awaiting: true }),
    ]);
    expect(screen.getByText('частково').classList.contains('is-partial')).toBe(true);
    expect(screen.getByText('ні').classList.contains('is-wrong')).toBe(true);
    expect(screen.getByText('чекає рішення').classList.contains('is-pending')).toBe(true);
  });

  it('shows the captain draft in italics until the answer is in', () => {
    const draft = row({ nickname: 'Команда', actor: 'Оля', draft: ans('Оде') });
    const { rerender } = show([draft]);
    expect(document.querySelector('.live-draft em')?.textContent).toBe('Оде');
    expect(screen.getByText('чернетка')).toBeTruthy();
    expect(screen.getByText('діє: Оля')).toBeTruthy();
    rerender(<LiveAnswers view={base()} live={live([row({ ...draft, answered: true, answer: ans('Одеса') })])} />);
    expect(document.querySelector('.live-draft')).toBeNull();
    expect(screen.getByText('Одеса')).toBeTruthy();
  });

  it('writes the progress of chain, sort, bluff, survey, slider and wager', () => {
    show([
      row({ progress: { kind: 'chain', solved: 1, total: 3, word: 'Океан', hints: 1 } }),
      row({ id: 'a', nickname: 'А', progress: { kind: 'sort', card: 'Буряк', sorted: 1, total: 4, misses: 0 } }),
      row({ id: 'b', nickname: 'Б', progress: { kind: 'bluff', stage: 'lies', lie: 'Лондон-2', pick: null } }),
      row({ id: 'c', nickname: 'В', progress: { kind: 'bluff', stage: 'choice', lie: null, pick: 'Барселона' } }),
      row({ id: 'd', nickname: 'Г', answered: true, answer: { type: 'survey', values: ['Яблуко', 'ананас'] } as never, progress: { kind: 'survey', ranks: [1, null] } }),
      row({ id: 'e', nickname: 'Д', answered: true, answer: { type: 'slider', value: 47 } as never }),
      row({ id: 'f', nickname: 'Е', answered: true, answer: ans('х'), progress: { kind: 'wager', wager: 300, allIn: false } }),
    ]);
    const body = document.querySelector('.live-rows')?.textContent ?? '';
    expect(body).toContain('відгадано 1 з 3 · зараз «Океан» · підказок 1');
    expect(body).toContain('картка «Буряк» · розкладено 1 з 4 · помилок 0');
    expect(body).toContain('вигадка: «Лондон-2»');
    expect(body).toContain('вибрав «Барселона»');
    expect(body).toContain('Яблуко → №1, ананас ✗');
    expect(body).toContain('ставка 300');
  });

  it('writes the slider distance', () => {
    show([row({ answered: true, answer: { type: 'slider', value: 47 } as never })], base({ correct: slider }));
    expect(document.querySelector('.live-answer')?.textContent).toBe('47 % · відстань 3 %');
  });

  it('lists only those who started', () => {
    show([row({ progress: { kind: 'chain', solved: 1, total: 3, word: 'Океан', hints: 0 } }), row({ id: 'p2', nickname: 'Петро' })]);
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Оля');
  });

  it('says nobody answered yet when no row has started', () => {
    show([row()]);
    expect(screen.getByText('Ще ніхто не відповів')).toBeTruthy();
  });

  it('folds the ghosts aside in details', () => {
    show([row({ answered: true, answer: ans('Одеса') })], base(), {
      aside: { kind: 'ghosts', answered: 1, total: 2, rows: [row({ id: 'g', nickname: 'Привид', answered: true, answer: ans('Київ'), verdict: 'wrong' })] },
    });
    const details = document.querySelector('details.live-aside') as HTMLElement;
    expect(details.querySelector('summary')?.textContent).toBe('Привиди: відповіли 1 з 2');
    expect(details.textContent).toContain('Київ');
  });

  it('puts the blitz queue instead of the rows and has no chips without instant', () => {
    show([row({ answered: true, answer: ans('х') })], base({ blitz: { instant: false } as never }), { kind: 'blitz' }, { blitz: <div className="blitz-queue">черга</div> });
    expect(document.querySelector('.blitz-queue')).toBeTruthy();
    expect(document.querySelector('.live-rows')).toBeNull();
    expect(document.querySelector('.live-chip')).toBeNull();
    expect(screen.getByText('у черзі: 1')).toBeTruthy();
  });

  it('drops the title and the id when compact', () => {
    show([row({ answered: true, answer: ans('х') })], base(), {}, { compact: true });
    expect(document.querySelector('h2')).toBeNull();
    expect(document.getElementById('live-answers')).toBeNull();
  });

  it('keeps all rows in the DOM past eight', () => {
    show(Array.from({ length: 12 }, (_, i) => row({ id: `p${i}`, nickname: `Н${i}`, answered: true, answer: ans('х') })));
    expect(document.querySelectorAll('.live-rows li')).toHaveLength(12);
  });
});
