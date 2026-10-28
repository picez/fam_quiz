// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBUFF_KINDS, type HostLive, type HostView, type LiveDraft, type LiveRow, type Question, type SortTilt } from '@quiz/shared';
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
  progress: null,
  wager: null,
  away: [],
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
type Extra = { blitz?: React.ReactNode; compact?: boolean; drafts?: Record<string, LiveDraft>; collapsed?: boolean; offsetMs?: number };
const show = (rows: LiveRow[], view = base(), over: Partial<HostLive> = {}, extra: Extra = {}) => render(<LiveAnswers view={view} live={live(rows, over)} {...extra} />);
const liveDraft = (over: Partial<LiveDraft> = {}): LiveDraft => ({ id: 'p1', draft: ans('Оде'), changes: 0, at: Date.now(), ...over });

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
    const draft = row({ nickname: 'Команда', actor: 'Оля' });
    const drafts = { p1: liveDraft() };
    const { rerender } = show([draft], base(), {}, { drafts });
    expect(document.querySelector('.live-draft em')?.textContent).toBe('друкують «Оде»');
    expect(screen.getByText('ще не надіслали')).toBeTruthy();
    expect(screen.getByText('діє: Оля')).toBeTruthy();
    rerender(<LiveAnswers view={base()} live={live([row({ ...draft, answered: true, answer: ans('Одеса') })])} drafts={drafts} />);
    expect(document.querySelector('.live-draft')).toBeNull();
    expect(screen.getByText('Одеса')).toBeTruthy();
  });

  it('writes the progress of chain, sort, bluff, survey, slider and wager', () => {
    show([
      row({ progress: { kind: 'chain', solved: 1, total: 3, word: 'Океан', hints: 1 } }),
      row({ id: 'a', nickname: 'А', progress: { kind: 'sort', card: 'Буряк', cardId: 'w3', seq: 1, sorted: 1, total: 4, misses: 0 } }),
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

  it('own-pace clues: every row is listed with «підказка N/M», none waits, an answered one names its clue', () => {
    const clues: Question = { id: 'q4', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 20, points: 1000, clues: ['a', 'b', 'c', 'd', 'e'], accepted: ['Шевченко'], interval: 8, cluePace: 'self' };
    show(
      [
        row({ progress: { kind: 'clues', opened: 3, total: 5 } }),
        row({ id: 'p2', nickname: 'Петро', answered: true, answer: { type: 'clues', value: 'Шевченко' }, clue: 3, progress: { kind: 'clues', opened: 3, total: 5 } }),
      ],
      base({ correct: clues }),
    );
    expect(screen.queryByText('Чекаємо:')).toBeNull();
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Оля');
    expect(rows[0].textContent).toContain('підказка 3/5');
    expect(rows[1].textContent).toContain('Шевченко');
    expect(rows[1].textContent).toContain('на підказці 3');
    expect(rows[1].textContent).not.toContain('підказка 3/5');
  });

  it('own-pace clues: after the time the silent ones are named in «Не відповіли»', () => {
    show([row({ progress: { kind: 'clues', opened: 2, total: 5 } }), row({ id: 'p2', nickname: 'Петро', answered: true, answer: { type: 'clues', value: 'Шевченко' }, clue: 4, progress: { kind: 'clues', opened: 4, total: 5 } })], base({ phase: 'locked' }));
    expect(screen.getByText('Не відповіли:')).toBeTruthy();
    const chips = document.querySelectorAll('.live-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toBe('Оля');
  });

  it('own-pace clues: a live draft stands beside «підказка N/M»', () => {
    show([row({ progress: { kind: 'clues', opened: 2, total: 5 } })], base(), {}, { drafts: { p1: liveDraft({ draft: { type: 'clues', value: 'Шевч' } }) } });
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.live-answer')?.textContent).toBe('підказка 2/5');
    expect(rows[0].querySelector('.live-draft')?.textContent).toContain('Шевч');
    expect(rows[0].textContent).toContain('ще не надіслав');
  });

  it('own-pace clues: the collapsed panel shows no rows', () => {
    show([row({ progress: { kind: 'clues', opened: 2, total: 5 } })], base(), {}, { collapsed: true });
    expect(document.querySelector('.live-rows')).toBeNull();
    expect(screen.getByText('Відповіли 0 з 1')).toBeTruthy();
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
      [row({ nickname: 'Червоні', actor: 'Оля' }), row({ id: 'p2', nickname: 'Сині', answered: true, answer: ans('Київ') })],
      base({ blitz: { instant: false, queue: [] } as never }),
      { kind: 'blitz' },
      { blitz: <div className="blitz-queue">черга</div>, drafts: { p1: liveDraft(), p2: liveDraft({ id: 'p2' }) } },
    );
    expect(document.querySelector('.blitz-queue')).toBeTruthy();
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.live-draft em')?.textContent).toBe('друкують «Оде»');
    expect(rows[0].textContent).toContain('ще не надіслали');
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
    show([row({ actor: 'Оля', spare: slider })], base(), {}, { drafts: { p1: liveDraft({ draft: { type: 'slider', value: 40 } }) } });
    expect(document.querySelector('.live-draft em')?.textContent).toBe('повзунок: 40 %');
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

describe('LiveAnswers: where the card is heading (11d)', () => {
  const sortView = (over: Partial<HostView> = {}) =>
    base({ question: { choices: [], sort: { categories: [{ id: 'c1', text: 'Овочі' }, { id: 'c2', text: 'Фрукти' }], total: 4, lockSeconds: 3 } } as never, ...over });
  const sortRow = () => row({ id: 'p1', progress: { kind: 'sort', card: 'Буряк', cardId: 'w3', seq: 1, sorted: 1, total: 4, misses: 0 } });
  const tilt = (over = {}) => ({ p1: { sorterId: 'p1', wordId: 'w3', toward: 'c1', amount: 0.5, seq: 1, ...over } });
  const body = (view: HostView, tilts: Record<string, SortTilt>) => {
    render(<LiveAnswers view={view} live={live([sortRow()])} tilts={tilts} />);
    return document.querySelector('.live-rows')?.textContent ?? '';
  };

  it('adds the category the card is dragged toward', () => {
    expect(body(sortView(), tilt())).toContain('→ «Овочі»');
  });

  it('adds nothing for a weak, stale or paused tilt', () => {
    expect(body(sortView(), tilt({ amount: 0.1 }))).not.toContain('→');
    cleanup();
    expect(body(sortView(), tilt({ seq: 0 }))).not.toContain('→');
    cleanup();
    expect(body(sortView({ paused: true }), tilt())).not.toContain('→');
  });

  it('shows the row of a sorter tilting the first card before any move', () => {
    const fresh = row({ id: 'p1', progress: { kind: 'sort', card: 'Буряк', cardId: 'w3', seq: 0, sorted: 0, total: 4, misses: 0 } });
    render(<LiveAnswers view={sortView()} live={live([fresh])} tilts={tilt({ seq: 0 })} />);
    expect(document.querySelector('.live-rows')?.textContent).toContain('→ «Овочі»');
    cleanup();
    render(<LiveAnswers view={sortView()} live={live([fresh])} tilts={{}} />);
    expect(document.querySelector('.live-rows')).toBeNull();
  });

  it('keeps the row while the finger tilts weakly or lets go, so it does not flicker; an older move hides it', () => {
    const fresh = row({ id: 'p1', progress: { kind: 'sort', card: 'Буряк', cardId: 'w3', seq: 0, sorted: 0, total: 4, misses: 0 } });
    for (const over of [{ toward: null, amount: 0 }, { amount: 0.1 }]) {
      render(<LiveAnswers view={sortView()} live={live([fresh])} tilts={tilt({ seq: 0, ...over })} />);
      expect(document.querySelector('.live-rows')?.textContent).toContain('Буряк');
      expect(document.querySelector('.live-rows')?.textContent).not.toContain('→');
      cleanup();
    }
    render(<LiveAnswers view={sortView()} live={live([fresh])} tilts={tilt({ seq: 1, toward: null, amount: 0 })} />);
    expect(document.querySelector('.live-rows')).toBeNull();
  });

  it('a tilt of another card adds no arrow', () => {
    expect(body(sortView(), tilt({ wordId: 'w1' }))).not.toContain('→');
  });
});

describe('LiveAnswers: live choices before «Надіслати» (12b)', () => {
  const options = [
    { id: 'o1', text: 'Київ' },
    { id: 'o2', text: 'Черкаси' },
    { id: 'o3', text: 'Умань' },
  ];
  const capitals = { id: 'q6', type: 'multi', text: 'Обласні центри?', imageUrl: null, video: null, timeLimit: 20, points: 1000, options, correctIds: ['o1', 'o2'] } as unknown as Question;
  const multiView = () => base({ correct: capitals, question: { type: 'multi', choices: options, right: [], pin: null, wall: null, slider: null } as never });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a solo row with no answer shows the italic draft, «ще не надіслав», the changes and the thinking time, which ticks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    show([row(), row({ id: 'p2', nickname: 'Петро' })], multiView(), {}, { drafts: { p1: liveDraft({ draft: { type: 'multi', optionIds: ['o1', 'o2'] }, changes: 2, at: 97_000 }) } });
    const rows = document.querySelectorAll('.live-rows li');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.live-draft em')?.textContent).toBe('позначає Київ, Черкаси');
    expect(within(rows[0] as HTMLElement).getByText('ще не надіслав').classList.contains('tag')).toBe(true);
    expect(rows[0].querySelector('.live-changes')?.textContent).toBe('змінював 2 рази');
    expect(rows[0].querySelector('.live-thinking')?.textContent).toBe('думає 3 с');
    expect(rows[0].querySelector('.live-answer')).toBeNull();
    // Оля ще не подала: вона й далі серед тих, на кого чекаємо.
    expect(document.querySelectorAll('.live-chip')).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(rows[0].querySelector('.live-thinking')?.textContent).toBe('думає 5 с');
  });

  it('the thinking time takes the clock offset', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    show([row()], base(), {}, { drafts: { p1: liveDraft({ at: 97_000 }) }, offsetMs: 4000 });
    expect(document.querySelector('.live-thinking')?.textContent).toBe('думає 7 с');
    expect(document.querySelector('.live-changes')).toBeNull();
  });

  it('an answered row shows only the answer, never a stale draft', () => {
    show([row({ answered: true, answer: ans('Одеса') })], base(), {}, { drafts: { p1: liveDraft() } });
    expect(document.querySelector('.live-draft')).toBeNull();
    expect(document.querySelector('.live-thinking')).toBeNull();
    expect(document.querySelector('.live-answer')?.textContent).toBe('Одеса');
  });

  it('a pin draft draws a mini map', () => {
    const view = base({ question: { type: 'pin', choices: [], imageUrl: null, pin: { map: 'world', aspect: 2 } } as never });
    show([row()], view, {}, { drafts: { p1: liveDraft({ draft: { type: 'pin', x: 0.3, y: 0.6 } }) } });
    expect(document.querySelector('.live-draft em')?.textContent).toBe('ставить точку');
    expect(document.querySelector('.live-row .live-pin .pin-board')).toBeTruthy();
  });

  it('a team row speaks in the plural: «змінювали», «думають», «з’єднали»', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    show([row({ nickname: 'Червоні', actor: 'Оля' })], multiView(), {}, { drafts: { p1: liveDraft({ draft: { type: 'multi', optionIds: ['o1'] }, changes: 5, at: 98_000 }) } });
    expect(document.querySelector('.live-draft em')?.textContent).toBe('позначають Київ');
    expect(document.querySelector('.live-changes')?.textContent).toBe('змінювали 5 разів');
    expect(document.querySelector('.live-thinking')?.textContent).toBe('думають 2 с');
  });

  it('a pin draft on a spare question draws the spare map', () => {
    const spare = { id: 's', text: '?', imageUrl: null, video: null, timeLimit: 20, points: 1000, type: 'pin', map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 5, zeroRadius: 20 } as never;
    show([row({ spare })], base(), {}, { drafts: { p1: liveDraft({ draft: { type: 'pin', x: 0.3, y: 0.6 } }) } });
    expect(document.querySelector('.live-row .live-pin .pin-board')).toBeTruthy();
  });

  it('collapsed, it keeps only the title and the count', () => {
    show(
      [row({ answered: true, answer: ans('Одеса') }), row({ id: 'p2', nickname: 'Петро' }), row({ id: 'p3', nickname: 'Іра' })],
      base(),
      { aside: { kind: 'ghosts', answered: 1, total: 1, rows: [row({ id: 'g', nickname: 'Привид', answered: true, answer: ans('Київ') })] } },
      { collapsed: true, drafts: { p2: liveDraft({ id: 'p2' }) } },
    );
    const section = document.getElementById('live-answers') as HTMLElement;
    expect(section.classList.contains('is-collapsed')).toBe(true);
    expect(within(section).getByRole('heading', { name: /Відповіді наживо/ })).toBeTruthy();
    expect(screen.getByText('Відповіли 1 з 3')).toBeTruthy();
    expect(document.querySelector('.live-row')).toBeNull();
    expect(document.querySelector('.live-waiting')).toBeNull();
    expect(document.querySelector('.live-aside')).toBeNull();
    expect(screen.queryByText('Ще ніхто не відповів')).toBeNull();
  });

  it('collapsed, a team blitz keeps the queue with its buttons', () => {
    show(
      [row({ nickname: 'Червоні', actor: 'Оля' })],
      base({ blitz: { instant: false, queue: [{ playerId: 'p1' }] } as never }),
      { kind: 'blitz' },
      { blitz: <div className="blitz-queue">черга</div>, collapsed: true, drafts: { p1: liveDraft() } },
    );
    expect(document.querySelector('.blitz-queue')).toBeTruthy();
    expect(screen.getByText('у черзі: 1')).toBeTruthy();
    expect(document.querySelector('.live-row')).toBeNull();
  });
});

describe('LiveAnswers: away marks (12e)', () => {
  const mark = (over: Partial<LiveRow['away'][number]> = {}): LiveRow['away'][number] => ({ personId: 'p1', nickname: 'Оля', ms: 4000, count: 1, out: false, ...over });

  it('an answered row says how long the player was away', () => {
    show([row({ answered: true, answer: ans('Одеса'), timeMs: 4200, away: [mark()] })]);
    expect(document.querySelector('.live-rows .live-away')?.textContent).toBe('🙈 поза грою 4 с (1 раз)');
  });

  it('a waiting chip says the player is out of the game now', () => {
    show([row({ away: [mark({ ms: 0, count: 0, out: true })] }), row({ id: 'p2', nickname: 'Петро' })]);
    const chips = document.querySelectorAll('.live-chip');
    expect(chips[0].querySelector('.live-away')?.textContent).toBe('🙈 зараз поза грою');
    expect(chips[1].textContent).toBe('Петро');
  });

  it('a team row names each person; a person row of a team poll does not', () => {
    const teams = base({ teams: {} as HostView['teams'] });
    show(
      [
        row({ id: 't1', nickname: 'Сови', answered: true, answer: ans('Одеса'), away: [mark(), mark({ personId: 'p2', nickname: 'Петро', ms: 0, count: 0, out: true })] }),
        row({ id: 'p3', nickname: 'Іра', answered: true, answer: ans('Львів'), away: [mark({ personId: 'p3', nickname: 'Іра', ms: 2500 })] }),
      ],
      teams,
    );
    const marks = [...document.querySelectorAll('.live-rows .live-away')].map((node) => node.textContent);
    expect(marks).toEqual(['🙈 Оля: поза грою 4 с (1 раз)', '🙈 Петро: зараз поза грою', '🙈 поза грою 2 с (1 раз)']);
  });
});
