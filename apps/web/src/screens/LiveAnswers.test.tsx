// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEBUFF_KINDS, type HostLive, type HostView, type LiveRow, type Question } from '@quiz/shared';
import { t } from '../i18n';
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
  wager: null,
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
      row({ id: 'f', nickname: 'Е', answered: true, answer: ans('х'), wager: { wager: 300, allIn: false } }),
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
    show([row({ answered: true, answer: ans('х') })], base({ blitz: { instant: false, queue: [{ playerId: 'p1' }] } as never }), { kind: 'blitz' }, { blitz: <div className="blitz-queue">черга</div> });
    expect(document.querySelector('.blitz-queue')).toBeTruthy();
    expect(document.querySelector('.live-rows')).toBeNull();
    expect(document.querySelector('.live-chip')).toBeNull();
    expect(screen.getByText('у черзі: 1')).toBeTruthy();
  });

  it('counts the blitz queue, not past attempts', () => {
    show([row({ answered: true, answer: ans('х'), verdict: 'wrong' })], base({ blitz: { instant: false, queue: [] } as never }), { kind: 'blitz' }, { blitz: <p>порожньо</p> });
    expect(screen.getByText('у черзі: 0')).toBeTruthy();
  });

  it('a team blitz shows the drafts of those not in the queue under it', () => {
    show(
      [row({ nickname: 'Червоні', actor: 'Оля', draft: ans('Оде') }), row({ id: 'p2', nickname: 'Сині', answered: true, answer: ans('Київ') })],
      base({ blitz: { instant: false, queue: [] } as never }),
      { kind: 'blitz' },
      { blitz: <div className="blitz-queue">черга</div> },
    );
    expect(document.querySelector('.blitz-queue')).toBeTruthy();
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.live-draft em')?.textContent).toBe('Оде');
    expect(rows[0].textContent).toContain('чернетка');
  });

  it('drops the title and the id when compact', () => {
    show([row({ answered: true, answer: ans('х') })], base(), {}, { compact: true });
    expect(document.querySelector('h2')).toBeNull();
    expect(document.getElementById('live-answers')).toBeNull();
  });

  it('has the help button in the panel title, but not when compact', () => {
    const { unmount } = show([row({ answered: true, answer: ans('х') })]);
    expect(within(document.querySelector('h2') as HTMLElement).getByRole('button', { name: 'Довідка: Відповіді наживо' })).toBeTruthy();
    unmount();
    show([row({ answered: true, answer: ans('х') })], base(), {}, { compact: true });
    expect(screen.queryByRole('button', { name: 'Довідка: Відповіді наживо' })).toBeNull();
  });

  it('keeps all rows in the DOM past eight in a focusable scroll region', () => {
    const { unmount } = show(Array.from({ length: 12 }, (_, i) => row({ id: `p${i}`, nickname: `Н${i}`, answered: true, answer: ans('х') })));
    expect(document.querySelectorAll('.live-rows li')).toHaveLength(12);
    const region = screen.getByRole('region', { name: 'Рядки відповідей наживо' });
    expect(region.tabIndex).toBe(0);
    expect(region.querySelector('.live-rows')).toBeTruthy();
    unmount();
    show([row({ answered: true, answer: ans('х') })]);
    expect(screen.queryByRole('region', { name: 'Рядки відповідей наживо' })).toBeNull();
  });

  it('the panel can take focus from the counter jump', () => {
    show([row()]);
    expect((document.getElementById('live-answers') as HTMLElement).tabIndex).toBe(-1);
  });

  it('marks an answered offline player', () => {
    show([row({ connected: false, answered: true, answer: ans('Одеса') })]);
    expect(document.querySelector('.live-rows li .live-offline')?.textContent).toBe('поза зв’язком');
  });

  it('formats a draft against the spare question', () => {
    show([row({ actor: 'Оля', draft: { type: 'slider', value: 40 } as never, spare: slider })]);
    expect(document.querySelector('.live-draft em')?.textContent).toBe('40 %');
  });

  it('writes the wall found and locked', () => {
    show([
      row({ progress: { kind: 'wall', found: 1, groups: 4, mistakes: 3, locked: true, solved: false } }),
      row({ id: 'p2', nickname: 'Петро', answered: true, progress: { kind: 'wall', found: 4, groups: 4, mistakes: 0, locked: false, solved: true } }),
    ]);
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows[0].textContent).toContain('1 з 4');
    expect(rows[0].textContent).toContain('замкнено');
    expect(rows[1].textContent).not.toContain('замкнено');
  });

  it('a trial door says only that it is picked', () => {
    show([row({ answered: true, progress: { kind: 'door', picked: 2 } })], base(), { kind: 'trial' });
    const text = document.querySelector('.live-answer')?.textContent ?? '';
    expect(text).toBe('вибрав двері');
    expect(text).not.toContain('3');
  });

  it('a duel shows both duellists, the tries and the win, without a counter', () => {
    show(
      [
        row({ progress: { kind: 'duel', tries: [], won: null } }),
        row({ id: 'p2', nickname: 'Петро', answered: true, verdict: 'correct', timeMs: 3000, progress: { kind: 'duel', tries: ['Львів', 'Ліон'], won: 'Лондон' } }),
      ],
      base(),
      { kind: 'duel' },
      { compact: true },
    );
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Оля');
    expect(rows[1].textContent).toContain('спроби: Львів, Ліон');
    expect(rows[1].textContent).toContain('вгадав: «Лондон»');
    expect(document.querySelector('.live-count')).toBeNull();
    expect(document.querySelector('.live-chip')).toBeNull();
  });

  it('folds the hall aside', () => {
    show([row({ answered: true, answer: ans('Одеса') })], base(), {
      aside: { kind: 'hall', answered: 1, total: 3, rows: [row({ id: 'h', nickname: 'Зала', answered: true, answer: ans('Львів') })] },
    });
    expect(document.querySelector('details.live-aside summary')?.textContent).toBe('Зал: відповіли 1 з 3');
  });

  it('writes the all-in tag with the wager', () => {
    show([row({ answered: true, answer: ans('х'), wager: { wager: 1000, allIn: true } })]);
    const text = document.querySelector('.live-answer')?.textContent ?? '';
    expect(text).toContain('ставка 1');
    expect(text).toContain('ва-банк');
  });

  it('a row with a buff, a spare and a clue', () => {
    show([row({ answered: true, answer: ans('Одеса'), buff: 'double', spare: text, clue: 2 })]);
    const li = document.querySelector('.live-rows li') as HTMLElement;
    expect(li.querySelector('.buff-tag')).toBeTruthy();
    expect(li.querySelector('.spare-tag')).toBeTruthy();
    expect(li.textContent).toContain('підказці 2');
  });

  it('writes an order and a pin answer', () => {
    const order: Question = {
      id: 'q5',
      type: 'order',
      text: 'Впорядкуйте',
      imageUrl: null,
      video: null,
      timeLimit: 20,
      points: 1000,
      items: [
        { id: 'i1', text: 'Перший' },
        { id: 'i2', text: 'Другий' },
      ],
    } as unknown as Question;
    show([row({ answered: true, answer: { type: 'order', itemIds: ['i2', 'i1'] } as never })], base({ correct: order }));
    expect(document.querySelector('.live-answer')?.textContent).toBe('Другий → Перший');
    cleanup();
    show([row({ answered: true, answer: { type: 'pin', x: 0.5, y: 0.5 } as never })]);
    expect(document.querySelector('.live-answer')?.textContent).toBe(t('pinAnswerBare'));
  });
});
