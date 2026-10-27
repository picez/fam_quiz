// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBUFF_KINDS, emptyBrief, type Answer, type BluffInfo, type BluffOptionView, type HostDuel, type HostLive, type HostView, type LiveRow, Question, RoundInfo, type WipeoutInfo, type WipeoutRow, type SurvivalInfo, type SurvivalRow } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { HostScreen } from './HostScreen';
import { ladderInfo } from './ladder-fixtures';
import { teamsView } from './team-test-view';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const single: Question = { id: 'q1', type: 'single', text: 'Столиця України?', imageUrl: null, video: null, timeLimit: 20, points: 1000, options, correctId: 'b' };
const textQuestion: Question = { id: 'q2', type: 'text', text: 'Перлина біля моря?', imageUrl: null, video: null, timeLimit: 20, points: 1000, accepted: ['Одеса'] };
const publicOf = (q: Question) => ({ type: q.type, text: q.text, imageUrl: null, video: null, timeLimit: 20, points: 1000, choices: q.type === 'single' ? options : [], right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null });

const players = [
  { id: 'p1', nickname: 'Олена', connected: true, score: 750, streak: 0, debuff: null },
  { id: 'p2', nickname: 'Тарас', connected: false, score: 0, streak: 0, debuff: null },
];

const view = (over: Partial<HostView> = {}): HostView => ({
  role: 'host',
  autopilot: false,
  phase: 'lobby',
  paused: false,
  blitz: null,
  board: null,
  spotlight: null,
  final: null,
  wipeout: null,
  survival: null,
  ladder: null,
  chain: null,
  sort: null,
  notice: null,
  pace: { next: null, lock: null, skip: null },
  live: null,
  buffs: [],
  buffNotice: null,
  debuffNotice: null,
  removed: [],
  splash: null,
  overtime: [],
  guide: null,
  newcomers: false,
  teams: null,
  duel: null,
  round: null,
  questionIndex: -1,
  total: 2,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 2,
  answeredCount: 0,
  limitMs: null,
  held: false,
  players,
  correct: null,
  responses: [],
  allowed: { debuffs: [...DEBUFF_KINDS], buffs: [] },
  hints: [],
  standings: [],
  breakdowns: {},
  sliderMarks: null,
  pinMarks: null,
  wall: null,
  cloud: null, survey: null, bluff: null, surveySkipped: [], undo: null,
  ...over,
});

const during = (phase: HostView['phase'], q: Question, over: Partial<HostView> = {}) =>
  view({ phase, questionIndex: 0, question: publicOf(q), correct: q, ...over });

function show(current: HostView, send: Send = vi.fn(async () => ({ ok: true as const }))) {
  render(
    <HostScreen
      view={current}
      code="123456"
      stageUrl="http://quiz.test/stage/123456#s"
      joinUrl="http://quiz.test/play/123456"
      send={send}
    />,
  );
  return send;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('HostScreen', () => {
  it('a video question has the player, the close button and no ±15 s', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(button('Закрити запитання')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '−15 с' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
  });

  it('shows the code, the players and their connection state in the lobby', () => {
    show(view());
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText(/немає зв’язку/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Відкрити сцену' }).getAttribute('href')).toBe('http://quiz.test/stage/123456#s');
  });

  it('the invite button is only in the lobby', () => {
    show(view());
    expect(screen.getByRole('button', { name: 'Запросити друзів' })).toBeTruthy();
    cleanup();
    show(during('question', single));
    expect(screen.queryByRole('button', { name: 'Запросити друзів' })).toBeNull();
  });

  it('starts the game, and cannot start without players', () => {
    const send = show(view());
    fireEvent.click(button('Почати гру'));
    expect(send).toHaveBeenCalledWith('host:start', undefined);
    cleanup();

    show(view({ players: [], playerCount: 0 }));
    expect(button('Почати гру').disabled).toBe(true);
  });

  it('offers exactly one main action for each phase', () => {
    const cases: [HostView, string, string][] = [
      [during('question', single), 'Закрити запитання', 'host:lock'],
      [during('locked', single), 'Показати відповідь', 'host:next'],
      [during('reveal', single), 'Далі', 'host:next'],
      [view({ phase: 'leaderboard', questionIndex: 0 }), 'Наступне запитання', 'host:next'],
    ];
    for (const [current, label, event] of cases) {
      const send = show(current);
      fireEvent.click(button(label));
      expect(send).toHaveBeenCalledWith(event, undefined);
      cleanup();
    }
  });

  it('shows the correct answer to the host while the question is open', () => {
    show(during('question', single));
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('pauses and resumes', () => {
    const send = show(during('question', single));
    fireEvent.click(button('Пауза'));
    expect(send).toHaveBeenCalledWith('host:pause', undefined);
    cleanup();

    const paused = show(during('question', single, { paused: true }));
    fireEvent.click(button('Продовжити'));
    expect(paused).toHaveBeenCalledWith('host:resume', undefined);
  });

  it('ends the game only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(during('question', single));
    fireEvent.click(button('Завершити гру'));
    expect(send).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(button('Завершити гру'));
    expect(send).toHaveBeenCalledWith('host:end', undefined);
  });

  it('lists responses with what each player answered', () => {
    show(
      during('reveal', single, {
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false, buff: null, spare: null, clue: null },
        ],
      }),
    );
    const row = screen.getByText('Київ').closest('li');
    expect(row?.textContent).toContain('Олена');
    expect(row?.textContent).toContain('зараховано');
    expect(row?.textContent).toContain('900');
  });

  it('names a picture answer by the letter players saw after a shuffle, like the correct answer', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const pictured: Question = { ...single, options: [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: pic }], correctId: 'b' } as Question;
    // Показано у зворотному порядку: картинка під літерою A, хоча в автора вона B.
    const shown = [{ id: 'b', text: '', imageUrl: pic }, { id: 'a', text: 'Львів' }];
    show(
      during('reveal', pictured, {
        question: { ...publicOf(pictured), choices: shown },
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false, buff: null, spare: null, clue: null },
        ],
      }),
    );
    expect(screen.getByText('Правильна відповідь: A. картинка')).toBeTruthy();
    const given = screen.getByText('Картинка A');
    expect(given.className).toBe('given');
    expect(given.closest('li')?.textContent).toContain('Олена');
  });

  it('the host can stop waiting', async () => {
    const olena = { playerId: 'p1', nickname: 'Олена' };
    const now = Date.now();
    const send = show(
      during('question', single, { endsAt: now - 1000, limitMs: 20_000, overtime: [{ ...olena, deadline: now + 24_000, remainingMs: null }] }),
    );
    expect(screen.queryByRole('button', { name: 'Закрити запитання' })).toBeNull();
    expect(screen.getByTitle('Чекаємо: Олена · 0:24')).toBeTruthy();
    fireEvent.click(button('Не чекати'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:lock', undefined));
    cleanup();
    // Баф узято, але спільний час ще йде: кнопка звичайна, рядка «Чекаємо» немає.
    show(during('question', single, { endsAt: now + 10_000, limitMs: 20_000, overtime: [{ ...olena, deadline: now + 40_000, remainingMs: null }] }));
    expect(button('Закрити запитання')).toBeTruthy();
    expect(screen.queryByText(/Чекаємо:/)).toBeNull();
    cleanup();
    show(during('question', single, { endsAt: now - 1000, limitMs: 20_000 }));
    expect(button('Закрити запитання')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Не чекати' })).toBeNull();
  });

  it('responses show the buff icon', () => {
    show(
      during('reveal', single, {
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'single', optionId: 'a' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false, buff: 'shield', spare: null, clue: null },
          { playerId: 'p2', nickname: 'Тарас', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false, buff: null, spare: null, clue: null },
        ],
      }),
    );
    const tag = screen.getByText('🛡');
    expect(tag.className).toContain('buff-tag');
    expect(tag.getAttribute('title')).toBe('Щит');
    expect(tag.closest('li')?.textContent).toContain('Олена');
    expect(document.querySelectorAll('.buff-tag')).toHaveLength(1);
  });

  it('the host answers a hint request with text or aloud', async () => {
    const now = Date.now();
    const hints = [{ playerId: 'p1', nickname: 'Олена', at: now - 2000 }];
    const send = show(during('question', single, { endsAt: now + 10_000, limitMs: 20_000, hints }));
    const card = screen.getByText('Олена просить підказку').closest('article') as HTMLElement;
    expect(card.className).toContain('hint-request');
    const sendBtn = within(card).getByRole('button', { name: 'Надіслати' }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    const field = within(card).getByLabelText('Підказка') as HTMLTextAreaElement;
    expect(field.maxLength).toBe(200);
    expect(field.closest('label')?.className).toContain('field');
    fireEvent.change(field, { target: { value: 'Тече через Київ' } });
    expect(sendBtn.disabled).toBe(false);
    fireEvent.click(sendBtn);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:hint', { playerId: 'p1', text: 'Тече через Київ' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Підказав уголос' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:hint', { playerId: 'p1', text: null }));
    // Запити стоять першими в панелі запитання — над «Відповіді».
    const responses = screen.getByRole('heading', { name: 'Відповіді' });
    expect(card.compareDocumentPosition(responses) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    show(during('question', { ...single, hint: 'Тече через Київ' } as Question, { endsAt: now + 10_000, limitMs: 20_000 }));
    expect(document.querySelector('.hint-request')).toBeNull();
    expect(screen.getByText('Підказка: Тече через Київ').className).toContain('hint-known');
  });

  it('a spare answer shows the mark and is read against the spare', () => {
    const spare: Question = { id: 's1', type: 'boolean', text: 'Чорне море солоніше за Азовське?', imageUrl: null, video: null, timeLimit: 20, points: 1000, correct: true };
    show(
      during('reveal', single, {
        responses: [
          { playerId: 'p1', nickname: 'Олена', answer: { type: 'boolean', value: true }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false, buff: 'swap', spare, clue: null },
          { playerId: 'p2', nickname: 'Тарас', answer: { type: 'single', optionId: 'b' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 900, overridden: false, buff: null, spare: null, clue: null },
        ],
      }),
    );
    const mark = screen.getByText('запасне');
    expect(mark.className).toContain('spare-tag');
    expect(mark.getAttribute('title')).toBe('Чорне море солоніше за Азовське?');
    const row = mark.closest('li') as HTMLElement;
    expect(row.textContent).toContain('Олена');
    expect(row.querySelector('.given')?.textContent).toBe('Так');
    expect(document.querySelectorAll('.spare-tag')).toHaveLength(1);
  });

  it('the host does not wait for a swap', async () => {
    const now = Date.now();
    const send = show(
      during('question', single, {
        endsAt: now - 1000,
        limitMs: 20_000,
        buffs: [{ playerId: 'p1', nickname: 'Олена', kind: 'swap' }],
        overtime: [{ playerId: 'p1', nickname: 'Олена', deadline: now + 19_000, remainingMs: null }],
      }),
    );
    expect(screen.getByTitle('Чекаємо: Олена · 0:19')).toBeTruthy();
    fireEvent.click(button('Не чекати'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:lock', undefined));
  });

  it('a buff notice reaches the host console', () => {
    show(during('question', single, { endsAt: Date.now() + 10_000, buffNotice: { seq: 1, at: Date.now(), playerId: 'p2', nickname: 'Олена', kind: 'fifty', questionIndex: 0 } }));
    expect(screen.getByText('Олена: 50/50')).toBeTruthy();
  });

  it('lets the host accept or reject text answers on reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Адеса' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false, buff: null, spare: null, clue: null },
      { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text' as const, value: 'Одеса' }, timeMs: 5000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 875, overridden: false, buff: null, spare: null, clue: null },
    ];
    const send = show(during('reveal', textQuestion, { responses }));
    fireEvent.click(button('Зарахувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
    fireEvent.click(button('Відхилити'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', grade: 'wrong' });
  });

  it('does not offer manual grading for choice questions or before reveal', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false, buff: null, spare: null, clue: null },
    ];
    show(during('reveal', single, { responses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    cleanup();

    const textResponses = [{ ...responses[0], answer: { type: 'text' as const, value: 'Адеса' } }];
    show(during('question', textQuestion, { responses: textResponses }));
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });

  it('removes a player only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(view());
    fireEvent.click(screen.getAllByRole('button', { name: 'Вилучити' })[1]);
    expect(send).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Вилучити гравця «Тарас» із гри?');

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Вилучити' })[1]);
    expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'p2' });
  });

  it('ignores a second tap while the first action is still on its way', () => {
    const send: Send = vi.fn(() => new Promise<never>(() => {}));
    show(during('locked', single), send);
    fireEvent.click(button('Показати відповідь'));
    fireEvent.click(button('Показати відповідь'));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('makes a pause obvious and offers to resume as the main action', () => {
    show(during('question', single, { paused: true }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    expect(button('Продовжити').className).toContain('btn-primary');
    expect(screen.queryByRole('button', { name: 'Закрити запитання' })).toBeNull();
  });

  it('explains a refused action', async () => {
    const send: Send = vi.fn(async () => ({ ok: false as const, error: 'no_players' }));
    show(view(), send);
    fireEvent.click(button('Почати гру'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Потрібен хоча б один гравець.'));
  });

  it('shows the final standings and no game actions once finished', () => {
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'finished', questionIndex: 1, standings }));
    expect(screen.getAllByText('Гру завершено').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Завершити гру' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Вилучити' })).toBeNull();
  });
});

describe('HostScreen: question image', () => {
  it('shows the image of the current question', () => {
    const imageUrl = '/uploads/0123456789abcdef0123456789abcdef.png';
    show(view({ phase: 'question', questionIndex: 0, question: { ...publicOf(single), imageUrl }, correct: single }));
    expect(document.querySelector('img.question-image')?.getAttribute('src')).toBe(imageUrl);
  });
});

describe('HostScreen: rounds', () => {
  const round = (over: Partial<RoundInfo> = {}): RoundInfo => ({ index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null, ...over });

  it('shows the round intro with a «start round» main action', () => {
    const send = show(view({ phase: 'intro', round: round() }));
    expect(screen.getAllByText(/Раунд 1 з 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Розминка/).length).toBeGreaterThan(0);
    fireEvent.click(button('Почати раунд'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('the host sees the round summary to read it aloud', () => {
    show(view({ phase: 'intro', round: round({ description: 'Кіно 90-х', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null }) }));
    expect(screen.getByText('Кіно 90-х')).toBeTruthy();
    expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
  });

  it('the host sees a long description whole, without clipping', () => {
    show(view({ phase: 'intro', round: round({ description: 'а'.repeat(600) }) }));
    expect(screen.getByText('а'.repeat(600))).toBeTruthy();
    expect(document.querySelector('.is-fit')).toBeNull();
  });

  it('the intro of a one-round quiz has no round counter', () => {
    show(view({ phase: 'intro', round: round({ total: 1, title: '', brief: { ...emptyBrief('classic'), speedBonus: true }, times: null }) }));
    expect(screen.queryByText(/Раунд 1 з 1/)).toBeNull();
    expect(button('Почати раунд')).toBeTruthy();
    expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
  });

  it('offers «next round» after the round results', () => {
    const send = show(view({ phase: 'round_end', round: round(), questionIndex: 1 }));
    fireEvent.click(button('Наступний раунд'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('numbers the question inside the round and names the round when there are several', () => {
    show(during('question', single, { round: round(), total: 5, questionIndex: 1 }));
    expect(screen.getByText(/Запитання 2 з 5/)).toBeTruthy();
    expect(screen.getByText(/Раунд 1/)).toBeTruthy();
    cleanup();
    show(during('question', single, { round: round({ total: 1 }), total: 5, questionIndex: 1 }));
    expect(screen.queryByText(/Раунд 1/)).toBeNull();
  });

  it('ends the round only after confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const send = show(during('question', single, { round: round() }));
    fireEvent.click(button('Завершити раунд'));
    expect(send).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button('Завершити раунд'));
    expect(send).toHaveBeenCalledWith('host:end-round', undefined);
  });

  it('calls the end-round action «finish the game» in the last round', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const send = show(during('question', single, { round: round({ index: 1 }) }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    fireEvent.click(button('Завершити гру'));
    expect(send).toHaveBeenCalledWith('host:end-round', undefined);
  });

  it('does not offer to end the round in the lobby or at the round results', () => {
    show(view({ round: round() }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    cleanup();
    show(view({ phase: 'round_end', round: round() }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
  });

  it('offers «partially» only when the round allows it', () => {
    const responses = [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Адеса' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false, buff: null, spare: null, clue: null },
    ];
    show(during('reveal', textQuestion, { responses, round: round() }));
    expect(screen.queryByRole('button', { name: 'Частково' })).toBeNull();
    cleanup();

    const send = show(during('reveal', textQuestion, { responses, round: round({ partial: true }) }));
    fireEvent.click(button('Частково'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'partial' });
  });

  it('marks a streak of two or more next to the nickname and prints negative points with a minus', () => {
    const hot = [
      { id: 'p1', nickname: 'Олена', connected: true, score: -500, streak: 3, debuff: null },
      { id: 'p2', nickname: 'Тарас', connected: true, score: 0, streak: 1, debuff: null },
    ];
    show(view({ phase: 'leaderboard', round: round(), questionIndex: 0, players: hot }));
    expect(screen.getByText('🔥 3')).toBeTruthy();
    expect(screen.queryByText('🔥 1')).toBeNull();
    expect(screen.getByText('−500')).toBeTruthy();
  });
});

describe('HostScreen: blitz', () => {
  const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
  const blitz = (over: Partial<NonNullable<HostView['blitz']>> = {}): NonNullable<HostView['blitz']> => ({
    voice: false,
    manual: true,
    winner: null,
    instant: false,
    rows: [],
    queue: [
      { playerId: 'p1', nickname: 'Олена', answer: { type: 'text', value: 'Одеса' }, deadline: null },
      { playerId: 'p2', nickname: 'Тарас', answer: null, deadline: null },
    ],
    attempts: [{ playerId: 'p2', nickname: 'Тарас', answer: null, grade: 'wrong', points: -1000 }],
    ...over,
  });

  it('judges the head of the queue in a manual blitz round', async () => {
    const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
    const send = show(during('question', textQuestion, { round, blitz: blitz(), spotlight }));
    expect(screen.getByText('пише…')).toBeTruthy();
    expect(screen.getByText('не встиг')).toBeTruthy();
    expect(screen.getByText(/у черзі: 2/)).toBeTruthy();
    fireEvent.click(button('Правильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: true }));
    fireEvent.click(button('Неправильно'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: false }));
  });

  it('the host sees each pick in the instant queue and the head orange with accept and repick', () => {
    const spotlight = { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text' as const, value: 'Київ' }, grade: null };
    const rows = [
      { playerId: 'p1', nickname: 'Олена', timeMs: 1200, grade: 'wrong' as const, answer: { type: 'text' as const, value: 'Одеса' } },
      { playerId: 'p2', nickname: 'Тарас', timeMs: 2500, grade: null, answer: { type: 'text' as const, value: 'Київ' } },
    ];
    show(during('question', textQuestion, { round, spotlight, answeredCount: 2, blitz: blitz({ manual: false, instant: true, rows, attempts: [], queue: [{ playerId: 'p2', nickname: 'Тарас', answer: spotlight.answer, deadline: null }] }) }));
    const list = document.querySelector('.blitz-queue');
    expect(list?.querySelectorAll('.given').length).toBe(2);
    expect(list?.querySelectorAll('li')[1]?.classList.contains('is-pending')).toBe(true);
    expect(list?.querySelectorAll('li')[0]?.classList.contains('is-pending')).toBe(false);
    expect(button('Прийняти')).toBeTruthy();
    expect(button('Перевибрати')).toBeTruthy();
    // Одна панель «Черга» — жива черга миттєвого бліцу; старих панелей черги й спроб немає.
    expect(screen.getAllByText('Черга')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Черга' }).closest('.panel')?.querySelector('ol.blitz-queue')).toBe(list);
    expect(screen.queryByText('Спроби')).toBeNull();
    expect(screen.getByText(/Відповіли 2 з 2/)).toBeTruthy();
  });

  it('the button blitz host panel is unchanged', () => {
    show(during('question', textQuestion, { round, blitz: blitz({ instant: false }) }));
    expect(screen.getByText('Черга')).toBeTruthy();
    expect(screen.getByText('Спроби')).toBeTruthy();
  });

  it('has no judge buttons in an automatic blitz round', () => {
    show(during('question', textQuestion, { round, blitz: blitz({ manual: false }) }));
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
  });

  it('does not offer grade changes after a blitz reveal', () => {
    show(
      during('reveal', textQuestion, {
        round,
        blitz: blitz({ queue: [] }),
        responses: [
          { playerId: 'p2', nickname: 'Тарас', answer: { type: 'text', value: 'Київ' }, timeMs: 1, accepted: false, grade: 'wrong', streakBonus: 0, points: -1000, overridden: false, buff: null, spare: null, clue: null },
        ],
      }),
    );
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
  });

  it('hides the queue once the question is closed', () => {
    show(during('reveal', textQuestion, { round, blitz: blitz({ queue: [] }) }));
    expect(screen.queryByText('Черга')).toBeNull();
    expect(screen.queryByText('Ще ніхто не відповів')).toBeNull();
    expect(screen.getByText('не встиг')).toBeTruthy();
  });

  describe('board round', () => {
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: true, description: '', brief: emptyBrief('board'), times: null };
    const three = [
      { id: 'p1', nickname: 'Олена', connected: true, score: 0, streak: 0, debuff: null },
      { id: 'p2', nickname: 'Тарас', connected: true, score: 0, streak: 0, debuff: null },
      { id: 'p3', nickname: 'Іра', connected: true, score: 0, streak: 0, debuff: null },
    ];
    const boardOf = (over: Partial<NonNullable<HostView['board']>> = {}): NonNullable<HostView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [
            { id: 'c1', price: 100, played: false, mark: 'x2', kind: 'normal', answerMode: 'phone', penalty: 'none' },
            { id: 'c2', price: 200, played: true, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
          ],
        },
      ],
      order: three.map((p) => ({ playerId: p.id, nickname: p.nickname })),
      turn: { playerId: 'p1', nickname: 'Олена' },
      cell: null,
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: ['x2'],
      marksHidden: false,
      manual: false,
      answer: null,
      ...over,
    });
    const onBoard = (over: Partial<HostView> = {}, board = boardOf()) =>
      view({ phase: 'board', round: boardRound, players: three, playerCount: 3, board, ...over });

    const diceOf = (waiting: string[], done = false) => ({
      rows: three.map((p) => ({ playerId: p.id, nickname: p.nickname, throws: waiting.includes(p.id) ? [] : [4], waiting: waiting.includes(p.id) })),
      tieBreak: false,
      done,
    });
    const onIntro = (board = boardOf({ turn: null })) => view({ phase: 'intro', round: boardRound, players: three, playerCount: 3, board });

    it('sets the board order with arrows, starts the dice, rolls for the rest and keeps the join order', async () => {
      const order = [three[2], three[0], three[1]].map((p) => ({ playerId: p.id, nickname: p.nickname }));
      const send = show(onIntro(boardOf({ turn: null, order })));
      expect(screen.getByText('Порядок ходів')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Кинути за тих, хто лишився' })).toBeNull();
      // порядок у панелі береться з board.order: Іра, Олена, Тарас
      fireEvent.click(button('Опустити Іра'));
      expect(send).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p3', 'p2'] });
      // кнопки розблоковуються, коли відповідь на попередню дію прийшла
      await waitFor(() => expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('Кидати кубики'));
      expect(send).toHaveBeenCalledWith('host:dice', undefined);
      cleanup();

      const rolling = show(onIntro(boardOf({ turn: null, order, dice: diceOf(['p2']) })));
      expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button('Кинути за тих, хто лишився'));
      expect(rolling).toHaveBeenCalledWith('host:roll', undefined);
      await waitFor(() => expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(button('За порядком приєднання'));
      expect(rolling).toHaveBeenCalledWith('host:order', { playerIds: ['p1', 'p2', 'p3'] });
      cleanup();

      show(onIntro(boardOf({ turn: null, dice: diceOf([], true) })));
      expect((button('Кидати кубики') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByRole('button', { name: 'Кинути за тих, хто лишився' })).toBeNull();
    });

    it('the host start button waits for the dice and names who has not rolled', () => {
      show(onIntro(boardOf({ turn: null, dice: diceOf(['p2', 'p3']) })));
      expect((button('Почати раунд') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Ще не кинули: Тарас, Іра. Можна кинути за них.')).toBeTruthy();
      cleanup();
      show(onIntro(boardOf({ turn: null, dice: diceOf([], true) })));
      expect((button('Почати раунд') as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/Ще не кинули/)).toBeNull();
    });

    it('the host sees the dice rows and the schedule', () => {
      const schedule = [{ number: 1, order: three.map((p) => ({ playerId: p.id, nickname: p.nickname })), done: 0 }];
      show(onIntro(boardOf({ turn: null, dice: diceOf([], true), schedule })));
      expect(document.querySelector('.dice-rows')).not.toBeNull();
      expect(screen.getByText('Розклад ходів')).toBeTruthy();
    });

    it('the host shows the turn queue under the legend', () => {
      const order = three.map((p) => ({ playerId: p.id, nickname: p.nickname }));
      show(onBoard({}, boardOf({ turn: { playerId: 'p1', nickname: 'Олена' }, schedule: [{ number: 1, order, done: 0 }] })));
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const queue = screen.getByText('Черга ходів');
      expect(legend.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(document.querySelector('.turn-schedule .is-turn')?.textContent).toBe('Олена');
    });

    it('the host shows the legend under the board', () => {
      show(onBoard());
      const legend = screen.getByRole('list', { name: 'Види клітинок' });
      const scroll = document.querySelector('.gb-scroll') as HTMLElement;
      expect(scroll.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('picks a cell for the chooser and skips a turn', async () => {
      const send = show(onBoard());
      expect(screen.getByText('Вибирає Олена')).toBeTruthy();
      fireEvent.click(button('Міста, 100'));
      expect(send).toHaveBeenCalledWith('host:pick', { cellId: 'c1' });
      fireEvent.click(button('Пропустити хід'));
      expect(send).toHaveBeenCalledWith('host:skip', undefined);
    });

    it('«Пропустити хід» waits for the pace window and fills (11b)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000_000);
      try {
        show(onBoard({ pace: { next: null, lock: null, skip: { from: 1_000_000 - 500, until: 1_000_000 + 1500 } } }));
        expect(button('Пропустити хід').disabled).toBe(true);
        expect(button('Пропустити хід').className).toContain('is-pacing');
        act(() => {
          vi.advanceTimersByTime(2100);
        });
        expect(button('Пропустити хід').disabled).toBe(false);
        expect(button('Пропустити хід').className).not.toContain('is-pacing');
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows the countdown for an absent chooser and a waiting turn on pause', () => {
      const away = three.map((p) => (p.id === 'p1' ? { ...p, connected: false } : p));
      show(onBoard({ players: away }, boardOf({ skipAt: Date.now() + 20_000 })));
      expect(screen.getByText(/Олена відключений, хід пропуститься через 20 с/)).toBeTruthy();
      cleanup();
      show(onBoard({ players: away, paused: true }, boardOf({ skipAt: null })));
      expect(screen.getByText('Олена відключений, гра на паузі, хід чекає')).toBeTruthy();
    });

    it('the host sees the countdown when an absent answerer will close an untimed cell', () => {
      const away = three.map((p) => (p.id === 'p1' ? { ...p, connected: false } : p));
      const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
      show(
        view({
          phase: 'question',
          questionIndex: 0,
          question: untimed,
          correct: single,
          round: boardRound,
          players: away,
          playerCount: 3,
          board: boardOf({ skipAt: Date.now() + 20_000 }),
        }),
      );
      expect(screen.getByText(/Олена відключений, клітинка закриється через 20 с/)).toBeTruthy();
    });

    it('grades a voice answer during the question', async () => {
      const send = show(
        during('question', single, {
          round: boardRound,
          players: three,
          board: boardOf({ manual: true, cell: { id: 'c1', category: 'Міста', price: 100, mark: 'x2', kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const } }),
        }),
      );
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
      expect(screen.getByText('×2')).toBeTruthy();
      expect(screen.queryByText(/відповіли/)).toBeNull();
      fireEvent.click(button('Зарахувати'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
      expect(button('Частково')).toBeTruthy();
    });

    it('a sort cell has no grading buttons: the sort scores its words itself', () => {
      const categories = [
        { id: 'k1', text: 'Овочі' },
        { id: 'k2', text: 'Фрукти' },
      ];
      const sortQ: Question = {
        id: 'q9',
        type: 'sort',
        text: 'Розкладіть',
        imageUrl: null,
        video: null,
        timeLimit: 60,
        points: 100,
        lockSeconds: 3,
        categories,
        words: [
          { id: 'w1', text: 'Морква', categoryId: 'k1' },
          { id: 'w2', text: 'Яблуко', categoryId: 'k2' },
          { id: 'w3', text: 'Буряк', categoryId: 'k1' },
          { id: 'w4', text: 'Груша', categoryId: 'k2' },
        ],
      };
      const cell = { id: 'c1', category: 'Міста', price: 400, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const sort = { total: 4, winner: null, words: null, live: null, rows: [{ playerId: 'p1', nickname: 'Олена', sorted: 2, misses: 0, timeMs: null, points: null }] };
      for (const phase of ['locked', 'reveal'] as const) {
        show(
          during(phase, sortQ, {
            round: boardRound,
            players: three,
            board: boardOf({ cell }),
            question: { ...publicOf(sortQ), choices: [], sort: { categories, total: 4, lockSeconds: 3 } },
            sort,
          }),
        );
        expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Частково' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Не зараховувати' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Прийняти' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Неправильно' })).toBeNull();
        cleanup();
      }
      // Звичайна клітинка з телефона на locked оцінюється, як і раніше.
      show(during('locked', single, { round: boardRound, players: three, board: boardOf({ cell }) }));
      expect(button('Зарахувати')).toBeTruthy();
      expect(button('Не зараховувати')).toBeTruthy();
    });

    it('the host sees the options when one player answers', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, grade: 'wrong' as const };
      show(during('reveal', single, { round: boardRound, players: three, spotlight, board: boardOf({ cell }) }));
      const choices = document.querySelector('.choices');
      expect(choices).not.toBeNull();
      expect(screen.getByText('Львів').closest('.choice')?.className).toContain('is-wrong');
      expect(screen.getByText('Київ').closest('.choice')?.className).toContain('is-correct');
      expect(screen.queryByText('Торкніться варіанта, який назвав гравець')).toBeNull();
      expect(choices?.querySelector('button')).toBeNull();
    });

    it('with the live panel up, a voice cell keeps its grade buttons and a phone cell loses the plain responses (11c)', () => {
      const voiceCell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const };
      const phoneCell = { ...voiceCell, answerMode: 'phone' as const };
      const live = { kind: 'answers' as const, answered: 0, total: 1, rows: [], aside: null };
      const base = { round: boardRound, players: three, endsAt: Date.now() + 20_000, live };
      show(during('question', single, { ...base, board: boardOf({ manual: true, cell: voiceCell }) }));
      expect(document.getElementById('live-answers')).not.toBeNull();
      expect(screen.getByRole('heading', { name: 'Відповіді' })).toBeTruthy();
      expect(button('Зарахувати')).toBeTruthy();
      cleanup();
      show(during('question', single, { ...base, board: boardOf({ cell: phoneCell }) }));
      expect(document.getElementById('live-answers')).not.toBeNull();
      expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
    });

    it('the host taps the option a voice player named', () => {
      const voiceCell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'voice' as const, penalty: 'none' as const };
      const send = show(during('question', single, { round: boardRound, players: three, endsAt: Date.now() + 20_000, board: boardOf({ manual: true, cell: voiceCell }) }));
      expect(screen.getByText('Торкніться варіанта, який назвав гравець')).toBeTruthy();
      fireEvent.click(button(/Київ/));
      expect(send).toHaveBeenCalledWith('host:name', { answer: { type: 'single', optionId: 'b' } });
      cleanup();
      // Позначка ведучого помаранчева, але це не відповідь з телефона: панелі «Прийняти»/«Перевибрати» немає.
      const named = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'b' }, grade: null };
      show(during('question', single, { round: boardRound, players: three, endsAt: Date.now() + 20_000, spotlight: named, board: boardOf({ manual: true, cell: voiceCell }) }));
      expect(button(/Київ/).className).toContain('is-pending');
      expect(screen.queryByRole('heading', { name: 'Відповідь чекає на рішення' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Прийняти' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Перевибрати' })).toBeNull();
      cleanup();
      // На усній бліц-клітинці позначки немає.
      show(
        during('question', single, {
          round: boardRound,
          players: three,
          endsAt: Date.now() + 20_000,
          board: boardOf({ manual: true, cell: { ...voiceCell, kind: 'blitz' } }),
          blitz: { voice: true, manual: true, queue: [], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(document.querySelector('.choices')).not.toBeNull();
      expect(screen.queryByRole('button', { name: /Київ/ })).toBeNull();
      expect(screen.queryByText('Торкніться варіанта, який назвав гравець')).toBeNull();
    });

    it('shows a phone answer awaiting a grade and hides grading without one', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'x2' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      show(during('question', textQuestion, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer: spotlight.answer }) }));
      expect(screen.getAllByText('Одеса').length).toBeGreaterThan(0);
      expect(button('Неправильно')).toBeTruthy();
      cleanup();
      show(during('question', textQuestion, { round: boardRound, players: three, board: boardOf({ manual: true, cell }) }));
      expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
    });

    it('grades a pending board answer by hand and can still re-pick', () => {
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      const send = show(
        during('question', textQuestion, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer: spotlight.answer }) }),
      );
      fireEvent.click(button('Правильно'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' });
      fireEvent.click(button('Частково'));
      expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'partial' });
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledWith('host:repick', { playerId: 'p1' });
    });

    it('a survey answer on a manual board is accepted, not graded by hand; a swapped chooser keeps the manual buttons', async () => {
      const surveyQ = { id: 's1', type: 'survey', text: 'Назвіть фрукт', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3, rows: [] } as unknown as Question;
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const answer = { type: 'survey' as const, values: ['Яблуко'], rows: ['sa'] } as Answer;
      const spotlight = { playerId: 'p1', nickname: 'Олена', answer, grade: null };
      const send = show(during('question', surveyQ, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer }) }));
      expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Неправильно' })).toBeNull();
      fireEvent.click(button('Прийняти'));
      await waitFor(() => expect(send).toHaveBeenCalledWith('host:accept', { playerId: 'p1' }));
      cleanup();
      // Після «Заміни запитання» гравець відповідав на запасне текстове: оцінка вручну.
      const swapped = { playerId: 'p1', nickname: 'Олена', answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      show(during('question', surveyQ, { round: boardRound, players: three, spotlight: swapped, board: boardOf({ manual: true, cell, answer: swapped.answer }) }));
      expect(button('Правильно')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Прийняти' })).toBeNull();
    });

    it('a survey cell has no hand grading after it closes', () => {
      const surveyQ = { id: 's1', type: 'survey', text: 'Назвіть фрукт', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3, rows: [] } as unknown as Question;
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const answer = { type: 'survey' as const, values: ['Яблуко'], rows: ['sa'] } as Answer;
      for (const phase of ['locked', 'reveal'] as const) {
        const spotlight = { playerId: 'p1', nickname: 'Олена', answer, grade: phase === 'reveal' ? ('partial' as const) : null };
        show(during(phase, surveyQ, { round: boardRound, players: three, spotlight, board: boardOf({ manual: true, cell, answer }) }));
        expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Не зараховувати' })).toBeNull();
        cleanup();
      }
      // Звичайна клітинка на reveal оцінюється.
      show(during('reveal', textQuestion, { round: boardRound, players: three, board: boardOf({ manual: true, cell }) }));
      expect(button('Зарахувати')).toBeTruthy();
    });

    it('renders no multiplier for unmarked cells, on the board and on the open cell', () => {
      const unmarked = boardOf().categories[0].cells.map((cell) => ({ ...cell, mark: 'none' as const }));
      show(onBoard({}, boardOf({ categories: [{ id: 'k1', title: 'Міста', cells: unmarked }], marks: [] })));
      expect(document.body.textContent).not.toContain('×');
      cleanup();
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      show(during('question', single, { round: boardRound, players: three, board: boardOf({ cell, marks: [] }) }));
      expect(screen.getByText('Відповідає Олена')).toBeTruthy();
      expect(document.body.textContent).not.toContain('×');
    });

    it("the chooser's row marks a spare answer and reads it against the spare", () => {
      const spare: Question = { id: 's1', type: 'boolean', text: 'Чорне море солоніше за Азовське?', imageUrl: null, video: null, timeLimit: 20, points: 1000, correct: true };
      const cell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const };
      const responses = [
        { playerId: 'p1', nickname: 'Олена', answer: { type: 'boolean' as const, value: true }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 100, overridden: false, buff: 'swap' as const, spare, clue: null },
      ];
      show(during('reveal', single, { round: boardRound, players: three, board: boardOf({ cell }), responses }));
      const mark = screen.getByText('запасне');
      expect(mark.className).toContain('spare-tag');
      expect(mark.getAttribute('title')).toBe('Чорне море солоніше за Азовське?');
      const row = mark.closest('li') as HTMLElement;
      expect(row.querySelector('.name')?.textContent).toBe('Олена');
      expect(row.querySelector('.given')?.textContent).toBe('Так');
    });

    it('does not show a stale question number in the board phase', () => {
      show(onBoard({ questionIndex: 0 }));
      expect(document.body.textContent).not.toMatch(/Запитання \d/);
    });

    it('disables the order buttons while an order send is pending', async () => {
      let done: () => void = () => {};
      const send: Send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (done = () => resolve({ ok: true }))));
      const order = three.map((p) => ({ playerId: p.id, nickname: p.nickname }));
      show(view({ phase: 'intro', round: boardRound, players: three, playerCount: 3, board: boardOf({ turn: null, order }) }), send);
      fireEvent.click(button('Опустити Олена'));
      expect((button('Опустити Тарас') as HTMLButtonElement).disabled).toBe(true);
      expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(button('Опустити Тарас'));
      expect(send).toHaveBeenCalledTimes(1);
      done();
      await waitFor(() => expect((button('За порядком приєднання') as HTMLButtonElement).disabled).toBe(false));
    });
  });


  describe('timing and pending answers', () => {
    const pendingSpot = { playerId: 'p1', nickname: 'Олена', answer: { type: 'single' as const, optionId: 'a' }, grade: null };

    it('adds or removes 15 seconds while the timer runs and respects the limits', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000 }));
      fireEvent.click(button('+15 с'));
      expect(send).toHaveBeenCalledWith('host:time', { seconds: 15 });
      fireEvent.click(button('−15 с'));
      expect(send).toHaveBeenCalledWith('host:time', { seconds: -15 });
      cleanup();
      show(during('question', single, { endsAt: Date.now() + 5_000 }));
      expect(button('−15 с').disabled).toBe(true);
      expect(button('+15 с').disabled).toBe(false);
      cleanup();
      show(during('question', single, { endsAt: null, remainingMs: 120_000, paused: true }));
      expect(button('+15 с').disabled).toBe(true);
      expect(button('−15 с').disabled).toBe(false);
      cleanup();
      show(during('reveal', single));
      expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
    });

    it('accepts or re-picks a pending answer in an automatic round', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }));
      expect(screen.getByRole('heading', { name: 'Відповідь чекає на рішення' })).toBeTruthy();
      fireEvent.click(button('Прийняти'));
      expect(send).toHaveBeenCalledWith('host:accept', { playerId: 'p1' });
    });

    it('re-picks a pending answer naming its player', () => {
      const send = show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }));
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledWith('host:repick', { playerId: 'p1' });
    });

    it('sends accept once and disables the pending buttons until the ack', async () => {
      let done: () => void = () => {};
      const send: Send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (done = () => resolve({ ok: true }))));
      show(during('question', single, { endsAt: Date.now() + 20_000, spotlight: pendingSpot }), send);
      fireEvent.click(button('Прийняти'));
      expect(button('Прийняти').disabled).toBe(true);
      expect(button('Перевибрати').disabled).toBe(true);
      fireEvent.click(button('Прийняти'));
      fireEvent.click(button('Перевибрати'));
      expect(send).toHaveBeenCalledTimes(1);
      done();
      await waitFor(() => expect(button('Прийняти').disabled).toBe(false));
    });

  describe('blitz cell', () => {
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: false, description: '', brief: emptyBrief('board'), times: null };
    const bob = { playerId: 'p2', nickname: 'Богдан' };
    const blitzCell = { id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'blitz' as const, answerMode: 'phone' as const, penalty: 'none' as const };
    const cellBoard = (over: Partial<NonNullable<HostView['board']>> = {}): NonNullable<HostView['board']> => ({
      categories: [
        {
          id: 'k1',
          title: 'Міста',
          cells: [{ id: 'c1', price: 100, played: false, mark: 'x2', kind: 'blitz', answerMode: 'phone', penalty: 'none' }],
        },
      ],
      order: [{ playerId: 'p1', nickname: 'Олена' }, bob],
      turn: { playerId: 'p1', nickname: 'Олена' },
      cell: null,
      dice: null,
      schedule: [],
      scheduleRepeats: false,
      skipAt: null,
      marks: ['x2'],
      marksHidden: false,
      manual: false,
      answer: null,
      ...over,
    });

    it('a blitz cell has the close-cell button and judge buttons for a voice head', () => {
      const head = { ...bob, answer: null, deadline: null };
      const send = show(
        during('question', textQuestion, {
          round: boardRound,
          endsAt: Date.now() + 20_000,
          board: cellBoard({ manual: true, cell: { ...blitzCell, answerMode: 'voice' } }),
          blitz: { voice: true, manual: true, queue: [head], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.getByText('Відповідає Богдан')).toBeTruthy();
      expect(screen.getByText('Вибір: Олена')).toBeTruthy();
      expect(screen.queryByText('Відповідає Олена')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
      fireEvent.click(button('Правильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p2', correct: true });
      fireEvent.click(button('Закрити клітинку'));
      expect(send).toHaveBeenCalledWith('host:lock', undefined);
    });

    it('a manual pending answer on a blitz cell is judged, not graded', () => {
      const spotlight = { ...bob, answer: { type: 'text' as const, value: 'Одеса' }, grade: null };
      const send = show(
        during('question', textQuestion, {
          round: boardRound,
          endsAt: Date.now() + 20_000,
          spotlight,
          board: cellBoard({ manual: true, cell: blitzCell, answer: spotlight.answer }),
          blitz: { voice: false, manual: true, queue: [{ ...bob, answer: spotlight.answer, deadline: null }], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.queryByRole('button', { name: 'Частково' })).toBeNull();
      fireEvent.click(button('Неправильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p2', correct: false });
      expect(send).not.toHaveBeenCalledWith('host:override', expect.anything());
    });

    it('the host board marks blitz cells', () => {
      const { container } = render(
        <HostScreen
          view={view({ phase: 'board', round: boardRound, board: cellBoard() })}
          code="123456"
          stageUrl="http://quiz.test/stage/123456#s"
          joinUrl="http://quiz.test/play/123456"
          send={vi.fn(async () => ({ ok: true as const }))}
        />,
      );
      expect(container.querySelector('.gb-kind')?.textContent).toBe('Бліц');
    });
  });

    it('judges a pending blitz head by hand', () => {
      const blitzRound: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
      const head = { playerId: 'p1', nickname: 'Олена', answer: pendingSpot.answer, deadline: null };
      const send = show(
        during('question', single, {
          round: blitzRound,
          endsAt: Date.now() + 20_000,
          spotlight: pendingSpot,
          blitz: { voice: false, manual: true, queue: [head], winner: null, attempts: [], instant: false, rows: [] },
        }),
      );
      expect(screen.getAllByRole('button', { name: 'Неправильно' })).toHaveLength(1);
      fireEvent.click(button('Неправильно'));
      expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: false });
      expect(button('Перевибрати')).toBeTruthy();
    });
  });
});

describe('HostScreen final', () => {
  const finalRound: RoundInfo = { index: 0, total: 1, title: 'Космос', type: 'final', partial: false, description: '', brief: emptyBrief('final'), times: null };
  const three = [
    { id: 'p1', nickname: 'Анна', connected: true, score: 1000, streak: 0, debuff: null },
    { id: 'p2', nickname: 'Богдан', connected: true, score: 500, streak: 0, debuff: null },
    { id: 'p3', nickname: 'Віра', connected: true, score: 300, streak: 0, debuff: null },
  ];
  const info = { theme: 'Космос', placed: 2, total: 3, shown: [], left: 0, mode: 'classic' as const, bank: 0, split: null };
  const entry = (playerId: string, nickname: string, over: object = {}) => ({
    playerId,
    nickname,
    answer: { type: 'single' as const, optionId: 'b' },
    grade: 'correct' as const,
    wager: 300,
    allIn: false,
    before: 1000,
    after: 1300,
    share: null,
    ...over,
  });
  const hostFinal = (over: object = {}) => ({ ...info, wagers: [], entries: [], manual: false, pending: [], splitNext: false, ...over });

  it('shows who has wagered and opens the final question', () => {
    const send = show(
      view({
        phase: 'wager',
        round: finalRound,
        players: three,
        final: hostFinal({
          wagers: [
            { playerId: 'p1', nickname: 'Анна', wager: 300, limit: 1000, allIn: false },
            { playerId: 'p2', nickname: 'Богдан', wager: 200, limit: 500, allIn: false },
            { playerId: 'p3', nickname: 'Віра', wager: null, limit: 300, allIn: false },
          ],
        }),
      }),
    );
    expect(screen.getByText('Поставили 2 з 3')).toBeTruthy();
    expect(screen.getByText('ще думає')).toBeTruthy();
    expect(document.querySelector('.wager-list li')?.textContent).toContain('300');
    fireEvent.click(button('Показати запитання'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('starts the final from the intro', () => {
    show(view({ phase: 'intro', round: finalRound, players: three }));
    expect(button('Почати фінал')).toBeTruthy();
  });

  it('lets the host end the round during the wagers', () => {
    show(view({ phase: 'wager', round: { ...finalRound, total: 2 }, players: three, final: hostFinal() }));
    expect(button('Завершити раунд')).toBeTruthy();
  });

  it('shows silent players next to the answers while the question is open', () => {
    show(
      during('question', single, {
        round: finalRound,
        players: three,
        final: hostFinal(),
        responses: [
          { playerId: 'p1', nickname: 'Анна', answer: { type: 'single', optionId: 'b' }, grade: 'correct', accepted: true, points: 0, streakBonus: 0, overridden: false, buff: null, spare: null, clue: null, timeMs: 1000 },
        ],
      }),
    );
    expect(screen.getAllByText('ще думає')).toHaveLength(2);
    expect(screen.queryByText('не відповів')).toBeNull();
    // До рішення ведучого в рядку лише відповідь: жодного «не зараховано» чи балів.
    expect(screen.queryByText('не зараховано')).toBeNull();
    expect(screen.queryByText('зараховано')).toBeNull();
  });

  it('calls the silent players «не відповів» once the question is closed', () => {
    show(during('locked', single, { round: finalRound, players: three, final: hostFinal(), responses: [] }));
    expect(screen.getAllByText('не відповів')).toHaveLength(3);
    expect(screen.queryByText('ще думає')).toBeNull();
  });

  it('has no ±15 s buttons in an untimed final', () => {
    show(during('question', single, { round: finalRound, players: three, final: hostFinal(), endsAt: null, remainingMs: null }));
    expect(screen.queryByRole('button', { name: '−15 с' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+15 с' })).toBeNull();
  });

  it('lists each player once on the final reveal and marks wrong rows with a cross', () => {
    show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        responses: [
          { playerId: 'p2', nickname: 'Богдан', answer: { type: 'single', optionId: 'a' }, grade: 'wrong', accepted: false, points: -200, streakBonus: 0, overridden: false, buff: null, spare: null, clue: null, timeMs: 1000 },
        ],
        final: hostFinal({
          left: 1,
          shown: [entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 })],
          entries: [
            entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 }),
            entry('p1', 'Анна', { before: 1000, after: 1300 }),
          ],
        }),
      }),
    );
    expect(screen.queryByText('Відповіді')).toBeNull();
    expect(screen.getAllByText('Богдан').filter((node) => node.closest('.rows li') !== null && node.className === 'name')).toHaveLength(2);
    expect(document.querySelectorAll('.wager-list li .name')).toHaveLength(2);
    expect(document.querySelector('.wager-list li.is-wrong .tag.is-wrong')?.textContent).toBe('✗');
    expect(document.querySelector('.wager-list li.is-correct .tag.is-correct')).toBeNull();
  });

  it('reveals the next final player and regrades an entry', () => {
    const send = show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        final: hostFinal({
          left: 2,
          shown: [entry('p3', 'Віра')],
          entries: [
            entry('p3', 'Віра', { before: 300, after: 600 }),
            entry('p2', 'Богдан', { grade: 'wrong', wager: 200, before: 500, after: 300 }),
            entry('p1', 'Анна', { answer: null, grade: 'wrong', after: 700 }),
          ],
        }),
      }),
    );
    expect(screen.getByText('Розкрито 1 з 3')).toBeTruthy();
    expect(screen.getByText('500 → 300')).toBeTruthy();
    // Мовчазного гравця оцінити не можна.
    expect(screen.getAllByRole('button', { name: 'Зарахувати' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Не зараховувати' })).toHaveLength(1);
    fireEvent.click(button('Наступний гравець'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    fireEvent.click(button('Зарахувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', grade: 'correct' });
  });

  it('regrades a correct entry to wrong', () => {
    const send = show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        final: hostFinal({ left: 0, shown: [entry('p1', 'Анна')], entries: [entry('p1', 'Анна')] }),
      }),
    );
    fireEvent.click(button('Не зараховувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'wrong' });
  });

  it('the wager list marks all-in', () => {
    show(
      view({
        phase: 'wager',
        round: finalRound,
        players: three,
        final: hostFinal({ wagers: [{ playerId: 'p1', nickname: 'Анна', wager: 1000, limit: 1000, allIn: true }] }),
      }),
    );
    expect(document.querySelector('.wager-list li .allin-tag')?.textContent).toBe('ва-банк');
  });

  it('the all-in tag has a fixed slot in every wager row', () => {
    show(
      view({
        phase: 'wager',
        round: finalRound,
        players: three,
        final: hostFinal({
          wagers: [
            { playerId: 'p1', nickname: 'Анна', wager: 1000, limit: 1000, allIn: true },
            { playerId: 'p2', nickname: 'Богдан', wager: 100, limit: 400, allIn: false },
          ],
        }),
      }),
    );
    const rows = [...document.querySelectorAll('.wager-list li')];
    for (const li of rows) expect([...li.children].map((child) => child.className)).toEqual(['name', 'given', 'allin-slot', 'meta']);
    expect(rows[0].querySelector('.allin-slot .allin-tag')?.textContent).toBe('ва-банк');
    expect(rows[1].querySelector('.allin-slot')?.textContent).toBe('');
  });

  it('the host splits the bank after the last reveal', () => {
    const send = show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 0, splitNext: true, mode: 'bank' }) }));
    fireEvent.click(button('Розділити банк'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    expect(screen.queryByRole('button', { name: 'Далі' })).toBeNull();
  });

  it('keeps the usual buttons without a split step', () => {
    show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 0, splitNext: false, mode: 'bank' }) }));
    expect(button('Далі')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Розділити банк' })).toBeNull();
    cleanup();
    show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 1, splitNext: true, mode: 'bank' }) }));
    expect(button('Наступний гравець')).toBeTruthy();
  });

  it('the host reveal list shows the bank and the shares', () => {
    const winner = entry('p1', 'Анна', { wager: 1000, before: 1000, after: 1642, share: 642 });
    show(
      during('reveal', single, {
        round: finalRound,
        players: three,
        final: hostFinal({
          left: 0,
          mode: 'bank',
          bank: 1500,
          shown: [winner],
          entries: [winner],
          split: { bank: 1500, refund: false, shares: [{ playerId: 'p1', nickname: 'Анна', wager: 1000, share: 642 }] },
        }),
      }),
    );
    expect(screen.getByText('Банк 1500 розділено')).toBeTruthy();
    expect(screen.getByText('+642 з банку')).toBeTruthy();
  });

  it('shows the running bank before the split', () => {
    show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 1, mode: 'bank', bank: 1500 }) }));
    expect(screen.getByText('Банк: 1500')).toBeTruthy();
  });

  it('reserves the share slot before the split and keeps the refund meter short', () => {
    const loser = entry('p1', 'Анна', { wager: 1000, before: 1000, after: 0 });
    const final = (split: object | null) =>
      hostFinal({ left: 0, mode: 'bank', bank: 1000, shown: [loser], entries: [loser], split: split as never });
    show(during('reveal', single, { round: finalRound, players: three, final: final(null) }));
    expect(document.querySelectorAll('.wager-list li .wager-share')).toHaveLength(1);
    expect(document.querySelector('.wager-list li .wager-share')?.textContent).toBe('');
    cleanup();
    show(during('reveal', single, { round: finalRound, players: three, final: final({ bank: 1000, refund: true, shares: [] }) }));
    expect(document.querySelector('.bank-meter')?.textContent).toBe('Ставки повернуто');
  });

  it('goes on with the usual next button once everyone is revealed', () => {
    show(during('reveal', single, { round: finalRound, players: three, final: hostFinal({ left: 0 }) }));
    expect(button('Далі')).toBeTruthy();
  });

  it('grades pending manual final answers', () => {
    const send = show(
      during('locked', textQuestion, {
        round: finalRound,
        players: three,
        final: hostFinal({
          manual: true,
          pending: [{ playerId: 'p1', nickname: 'Анна', answer: { type: 'text', text: 'Марс' } }],
        }),
      }),
    );
    fireEvent.click(button('Не зараховувати'));
    expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'wrong' });
  });

  it('the host sees chain progress for every player', () => {
    const chainQ: Question = { id: 'q3', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null, timeLimit: 20, points: 1000, words: ['Форель', 'Риба'], hintSeconds: 5 };
    const info = {
      total: 1,
      rows: [
        { playerId: 'p1', nickname: 'Олена', solved: 1, hints: 1, timeMs: 8000, points: null },
        { playerId: 'p2', nickname: 'Тарас', solved: 0, hints: 0, timeMs: null, points: null },
      ],
    };
    show(view({ phase: 'question', questionIndex: 0, question: { ...publicOf(single), type: 'chain', choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } }, correct: chainQ, endsAt: Date.now() + 20_000, chain: info }));
    expect(screen.getByRole('heading', { name: 'Ланцюжок' })).toBeTruthy();
    expect(document.querySelector('.chain-board')?.textContent).toContain('8,0 с');
    expect(document.querySelector('.chain-board')?.textContent).toContain('0 з 1');
    // Бали ланцюжка рахуються при закритті: панель «Відповіді» з нулями не показується.
    expect(document.querySelector('.chain-board .is-out')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
  });
});

describe('HostScreen sort', () => {
  it('the host sees the progress and the grouping and can close the sort', () => {
    const categories = [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
    ];
    const sortQ: Question = {
      id: 'q4',
      type: 'sort',
      text: 'Розкладіть',
      imageUrl: null,
      video: null,
      timeLimit: 60,
      points: 100,
      lockSeconds: 3,
      categories,
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'c1' },
        { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
        { id: 'w3', text: 'Буряк', categoryId: 'c1' },
        { id: 'w4', text: 'Груша', categoryId: 'c2' },
      ],
    };
    const info = { total: 4, winner: null, words: null, live: null, rows: [{ playerId: 'p1', nickname: 'Олена', sorted: 2, misses: 1, timeMs: null, points: null }] };
    const send = vi.fn(async () => ({ ok: true as const }));
    show(
      view({ phase: 'question', questionIndex: 0, question: { ...publicOf(single), type: 'sort', choices: [], sort: { categories, total: 4, lockSeconds: 3 } }, correct: sortQ, endsAt: Date.now() + 20_000, sort: info }),
      send,
    );
    expect(screen.getByRole('heading', { name: 'Сортування' })).toBeTruthy();
    expect(document.querySelector('.sort-board')?.textContent).toContain('2/4');
    expect(document.body.textContent).toContain('Овочі: Морква, Буряк; Фрукти: Яблуко, Груша');
    expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Зарахувати' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Закрити запитання' }));
    expect(send).toHaveBeenCalledWith('host:lock', undefined);
  });
});

describe('HostScreen timer and round facts', () => {
  it('the host sees the timer with the full time and its state', () => {
    show(during('question', single, { endsAt: Date.now() + 20_000, limitMs: 30_000 }));
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.getByText('/ 30 с')).toBeTruthy();
    cleanup();
    show(during('question', single, { endsAt: null, remainingMs: 20_000, limitMs: 30_000, paused: true }));
    expect(screen.getAllByText('Пауза').length).toBeGreaterThan(0);
  });

  it('the host timer says the answer waits for the host', () => {
    show(during('question', single, { endsAt: null, remainingMs: 20_000, limitMs: 30_000, held: true }));
    const timer = screen.getByRole('timer');
    expect(timer.querySelector('.timer-status')?.textContent).toBe('Чекає рішення ведучого');
    expect(timer.querySelector('.timer-total')).toBeNull();
  });

  it('the video title is masked during the question and open at the reveal', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('.video-mask')).not.toBeNull();
    cleanup();
    show(view({ phase: 'reveal', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(document.querySelector('iframe')).not.toBeNull();
    expect(document.querySelector('.video-mask')).toBeNull();
  });

  it('no timer for a video question on the host', () => {
    const untimed = { ...publicOf(single), video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: null };
    show(view({ phase: 'question', questionIndex: 0, question: untimed, correct: single, endsAt: null, remainingMs: null }));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('the host intro shows the round facts', () => {
    const round: RoundInfo = { index: 0, total: 1, title: 'Місто', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: { min: 30, max: 60 } };
    show(view({ phase: 'intro', round, total: 10 }));
    expect(screen.getByText('10 запитань · 30–60 с на кожне')).toBeTruthy();
  });
});

describe('HostScreen player tools', () => {
  const running = (over: Partial<HostView> = {}) => during('question', single, over);

  it('points and debuff buttons appear beside each player only while the game runs', () => {
    show(view());
    expect(screen.queryByRole('button', { name: 'Бали' })).toBeNull();
    cleanup();
    show(view({ phase: 'finished' }));
    expect(screen.queryByRole('button', { name: 'Дебаф' })).toBeNull();
    cleanup();
    show(running());
    expect(screen.getAllByRole('button', { name: 'Бали' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Дебаф' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Вилучити' })).toHaveLength(2);
  });

  it('one tools panel opens at a time', () => {
    show(running());
    const points = screen.getAllByRole('button', { name: 'Бали' });
    const debuffs = screen.getAllByRole('button', { name: 'Дебаф' });
    expect(points[0].getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(points[0]);
    expect(points[0].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Своя сума')).toBeTruthy();
    fireEvent.click(debuffs[1]);
    expect(screen.queryByLabelText('Своя сума')).toBeNull();
    expect(debuffs[1].getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Спрацює в наступному запитанні, де гравець відповідає.')).toBeTruthy();
    expect(debuffs[1].closest('li')?.contains(screen.getByText('Спрацює в наступному запитанні, де гравець відповідає.'))).toBe(true);
    fireEvent.click(debuffs[1]);
    expect(screen.queryByText('Спрацює в наступному запитанні, де гравець відповідає.')).toBeNull();
  });

  it('the host sees only allowed debuffs and no debuff tool when none are allowed', () => {
    show(running({ allowed: { debuffs: ['fog', 'mud'], buffs: [] } }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Дебаф' })[0]);
    expect([...document.querySelectorAll('.debuff-picks button')].map((node) => node.textContent)).toEqual(['🌫️ Туман', '🟫 Брудний екран']);
    cleanup();
    show(running({ allowed: { debuffs: [], buffs: [] } }));
    expect(screen.queryByRole('button', { name: 'Дебаф' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Бали' })).toHaveLength(2);
  });

  it('the player row shows the debuff tag', () => {
    show(running({ players: [{ ...players[0], debuff: { kind: 'mud', fired: true, by: null } }, players[1]] }));
    expect(screen.getByText('🟫 Брудний екран · діє')).toBeTruthy();
  });
});

const hostDuel = (patch: Partial<HostDuel> = {}): HostDuel => ({
  challenger: { playerId: 'p1', nickname: 'Оля' },
  opponent: { playerId: 'p2', nickname: 'Петро' },
  stage: 'question',
  categories: [
    { id: 'dc1', title: 'Столиці', left: 3 },
    { id: 'dc2', title: 'Хімія', left: 0 },
  ],
  category: 'Столиці',
  number: 1,
  total: 3,
  question: 'Столиця Франції?',
  accepted: ['Париж'],
  wins: { challenger: 0, opponent: 0 },
  tries: { challenger: 0, opponent: 2 },
  tryTexts: { challenger: [], opponent: ['Львів', 'Ліон'] },
  questionWinner: null,
  winningAnswer: null,
  winner: null,
  stake: 300,
  ending: false,
  ...patch,
});
const duelRound: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };

describe('HostScreen: duel', () => {
  it('the host starts, steers and cancels a duel', async () => {
    const send = show(during('reveal', single, { round: duelRound, duel: hostDuel({ stage: 'declared', category: null, question: null, accepted: null }) }));
    expect(screen.getByText('Оголошено дуель: Оля — Петро')).toBeTruthy();
    fireEvent.click(button('Почати дуель'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:next', undefined));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(button('Скасувати дуель'));
    expect(send).not.toHaveBeenCalledWith('host:duel-cancel', undefined);
    confirm.mockReturnValue(true);
    fireEvent.click(button('Скасувати дуель'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:duel-cancel', undefined));
  });

  it('the host picks for the challenger and skips a question', async () => {
    const picked = show(view({ phase: 'duel', round: duelRound, duel: hostDuel({ stage: 'category', category: null, question: null, accepted: null }) }));
    expect(screen.getByText('Категорію вибирає Оля. Якщо треба, виберіть за гравця:')).toBeTruthy();
    expect(button(/Хімія/).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Почати дуель' })).toBeNull();
    fireEvent.click(button(/Столиці/));
    await waitFor(() => expect(picked).toHaveBeenCalledWith('host:duel-category', { categoryId: 'dc1' }));
    cleanup();
    const send = show(view({ phase: 'duel', round: duelRound, duel: hostDuel() }));
    expect(screen.getByText('Прийнятні відповіді: Париж')).toBeTruthy();
    expect(screen.getByText('Спроби Петро: Львів, Ліон')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Наступне запитання|Підсумок|Продовжити/ })).toBeNull();
    fireEvent.click(button('Пропустити запитання'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:duel-skip', undefined));
    fireEvent.click(button('Пауза'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:pause', undefined));
  });

  it('no round end mid-duel, even one started at the intro; it is back once the duel is over', () => {
    show(view({ phase: 'duel', round: duelRound, duel: hostDuel({ stage: 'category', category: null, question: null, accepted: null }) }));
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    expect(button('Скасувати дуель')).toBeTruthy();
    cleanup();
    show(view({ phase: 'intro', round: duelRound, duel: hostDuel({ stage: 'declared', category: null, question: null, accepted: null }) }));
    expect(button('Завершити раунд')).toBeTruthy();
  });

  it('the host sees the duel timer while a duel question runs, and not at the reveal', () => {
    const endsAt = Date.now() + 20_000;
    show(view({ phase: 'duel', round: duelRound, duel: hostDuel(), endsAt, remainingMs: null, limitMs: 30_000 }));
    const timer = within(document.querySelector('.duel-host') as HTMLElement).getByRole('timer');
    expect(Number(timer.getAttribute('aria-label'))).toBeGreaterThanOrEqual(19);
    expect(timer.querySelector('.timer-label')?.getAttribute('data-total')).toBe(t('timerOf', { seconds: 30 }));
    cleanup();
    show(view({ phase: 'duel', round: duelRound, duel: hostDuel({ stage: 'answer' }), endsAt: null, remainingMs: null, limitMs: 30_000 }));
    expect(document.querySelector('.duel-host [role="timer"]')).toBeNull();
  });

  it('the main button walks the duel', async () => {
    const labels: [Partial<HostDuel>, string][] = [
      [{ stage: 'answer', ending: false }, 'Наступне запитання дуелі'],
      [{ stage: 'answer', ending: true }, 'Підсумок дуелі'],
      [{ stage: 'result', winner: { playerId: 'p1', nickname: 'Оля' } }, 'Продовжити гру'],
    ];
    for (const [patch, label] of labels) {
      const send = show(view({ phase: 'duel', round: duelRound, duel: hostDuel(patch) }));
      // Раунд під час дуелі не завершують; вихід — «Скасувати дуель».
      expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
      fireEvent.click(button(label));
      await waitFor(() => expect(send).toHaveBeenCalledWith('host:next', undefined));
      cleanup();
    }
  });
});

describe('HostScreen: splashes', () => {
  const T = 1_000_000;
  afterEach(() => vi.useRealTimers());

  it('the host console is never covered; a chip tells a splash is on screen', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    show(during('question', single, { endsAt: T + 21_200, limitMs: 20_000, splash: { kind: 'question', at: T, until: T + 1200 } }));
    expect(document.querySelector('.splash')).toBeNull();
    expect(screen.getByText('На екрані заставка')).toBeTruthy();
    expect(button('Закрити запитання').disabled).toBe(false);
    expect(button('+15 с').disabled).toBe(false);
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('20');
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByText('На екрані заставка')).toBeNull();
  });

  it('the full time on the host clock: −15 s and +15 s follow the limit, not the splash', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    // Ліміт 120 с і заставка: залишок 121 с обрізається до 120 — «+15 с» вимкнено рівно як без заставки.
    show(during('question', single, { endsAt: T + 121_200, limitMs: 120_000, splash: { kind: 'question', at: T, until: T + 1200 } }));
    expect(button('+15 с').disabled).toBe(true);
    cleanup();
    // Ліміт 5 с: залишок 6 с обрізається до 5 — «−15 с» вимкнено.
    show(during('question', single, { endsAt: T + 6_200, limitMs: 5_000, splash: { kind: 'question', at: T, until: T + 1200 } }));
    expect(button('−15 с').disabled).toBe(true);
  });
});

describe('HostScreen: «Як грати»', () => {
  const guide = { page: 0, pages: [{ kind: 'phone' as const }, { kind: 'questions' as const, types: [{ type: 'single' as const, top: '' }] }] };
  it('the host pages the guide and can skip it', async () => {
    const send = show(view({ phase: 'guide', guide, newcomers: true }));
    expect(screen.getByText('Відповідайте з телефона')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Далі' }));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    await waitFor(() => expect(button('До гри').disabled).toBe(false));
    fireEvent.click(button('До гри'));
    expect(send).toHaveBeenCalledWith('host:guide-skip', undefined);
    expect(screen.queryByRole('button', { name: 'Завершити раунд' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeTruthy();
  });
  it('on the last page the main button says «До гри» and there is no second one', () => {
    const send = show(view({ phase: 'guide', guide: { ...guide, page: 1 }, newcomers: true }));
    const buttons = screen.getAllByRole('button', { name: 'До гри' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });
  it('paused: neither button', () => {
    show(view({ phase: 'guide', guide, newcomers: true, paused: true }));
    expect(screen.queryByRole('button', { name: 'Далі' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'До гри' })).toBeNull();
  });
});

describe('HostScreen: after the game', () => {
  it('after the game the host goes to the quizzes or the game history', () => {
    show(view({ phase: 'finished', questionIndex: 1, standings: [] }));
    expect(screen.getByRole('link', { name: 'До вікторин' }).getAttribute('href')).toBe('/quizzes');
    expect(screen.getByRole('link', { name: 'Історія ігор' }).getAttribute('href')).toBe('/history');
    cleanup();
    show(view({ phase: 'lobby' }));
    expect(screen.queryByRole('link', { name: 'До вікторин' })).toBeNull();
  });
});

describe('HostScreen: points per round (11f)', () => {
  const rows = [
    { participantId: 'p1', nickname: 'Олена', score: 750, totalTimeMs: 1, rank: 1, rounds: [1000, -250] },
    { participantId: 'p2', nickname: 'Петро', score: 300, totalTimeMs: 1, rank: 2, rounds: [300, 0] },
  ];
  const breakdowns = {
    p1: { parts: [{ source: 'answers' as const, plus: 1000, minus: -250 }], plus: 1000, minus: -250 },
    p2: { parts: [{ source: 'answers' as const, plus: 300, minus: 0 }], plus: 300, minus: 0 },
  };

  it('the panel is folded and mounts the table only when opened; any row opens its plus / minus', () => {
    show(view({ phase: 'question', questionIndex: 0, question: publicOf(single), correct: single, standings: rows, breakdowns }));
    const panel = document.querySelector('details.host-scores') as HTMLDetailsElement;
    expect(panel.textContent).toContain('Бали за раундами');
    expect(document.querySelector('.score-table')).toBeNull();
    const summary = panel.querySelector('summary')!;
    fireEvent.click(summary);
    panel.open = true;
    fireEvent(panel, new Event('toggle'));
    expect(document.querySelectorAll('.score-table button.score-row-toggle')).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button', { name: '«+ / −» для Петро' }));
    expect(panel.querySelector('.score-breakdown')!.textContent).toContain('Відповіді +300');
  });

  it('there is no panel in the lobby, and there is one at the round end and after the game', () => {
    show(view({ phase: 'lobby', standings: rows, breakdowns }));
    expect(document.querySelector('details.host-scores')).toBeNull();
    cleanup();
    show(view({ phase: 'round_end', round: { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null }, standings: rows, breakdowns }));
    expect(document.querySelector('details.host-scores')).not.toBeNull();
    expect(screen.getByText('Підсумки раунду 1')).toBeTruthy();
    cleanup();
    show(view({ phase: 'finished', questionIndex: 1, standings: rows, breakdowns }));
    expect(document.querySelector('details.host-scores')).not.toBeNull();
    expect(screen.getAllByText('Гру завершено').length).toBeGreaterThan(0);
  });
});

describe('host help', () => {
  const classicRound: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };
  const boardRound: RoundInfo = { ...classicRound, title: 'Поле', type: 'board', partial: true, brief: emptyBrief('board') };
  const cellOf = (over: object) => ({ id: 'c1', category: 'Міста', price: 100, mark: 'none' as const, kind: 'normal' as const, answerMode: 'phone' as const, penalty: 'none' as const, ...over });
  const boardWith = (cell: ReturnType<typeof cellOf>): NonNullable<HostView['board']> => ({
    categories: [],
    order: [],
    turn: null,
    cell,
    dice: null,
    schedule: [],
    scheduleRepeats: false,
    skipAt: null,
    marks: [],
    marksHidden: false,
    manual: false,
    answer: null,
  });

  it('during a question the round and the question type have ⓘ; help sends nothing and the main button still works', () => {
    const send = show(during('question', single, { round: classicRound, endsAt: Date.now() + 20_000 }));
    const line = document.querySelector('.host-context') as HTMLElement;
    expect(line.textContent).toContain('Розминка');
    expect(line.textContent).toContain('Один правильний варіант');
    fireEvent.click(within(line).getByRole('button', { name: 'Довідка: Один правильний варіант' }));
    screen.getByRole('dialog', { name: 'Один правильний варіант' });
    expect(send).not.toHaveBeenCalled();
    const lock = button('Закрити запитання');
    fireEvent.pointerDown(lock);
    fireEvent.click(lock);
    expect(send).toHaveBeenCalledWith('host:lock', undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the round intro has ⓘ next to its title', () => {
    show(view({ phase: 'intro', round: classicRound }));
    fireEvent.click(button('Довідка: Класичний'));
    screen.getByRole('dialog', { name: 'Класичний' });
  });

  it('a board cell shows ⓘ of its kind', () => {
    show(during('question', single, { round: boardRound, board: boardWith(cellOf({ kind: 'blitz' })) }));
    button('Довідка: Бліц-клітинка');
    cleanup();
    show(during('question', single, { round: boardRound, board: boardWith(cellOf({ answerMode: 'voice' })) }));
    button('Довідка: Відповідь уголос');
    cleanup();
    show(during('question', single, { round: boardRound, board: boardWith(cellOf({ mark: 'x2' })) }));
    button('Довідка: ×2 і ×3');
  });

  it('on the board the context line has only the round, without a question type', () => {
    show(view({ phase: 'board', round: boardRound, board: boardWith(cellOf({})) }));
    const line = document.querySelector('.host-context') as HTMLElement;
    expect(line.textContent).toContain('Поле');
    within(line).getByRole('button', { name: 'Довідка: Ігрове поле' });
    expect(within(line).getAllByRole('button')).toHaveLength(1);
  });

  it('links to the host reference in a new tab', () => {
    show(view({ phase: 'lobby' }));
    const link = screen.getByRole('link', { name: 'Довідка ведучого' });
    expect(link.getAttribute('href')).toBe('/help');
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('HostScreen media (10b)', () => {
  const clip = { source: 'file' as const, url: '/uploads/abcdef0123456789.mp3', start: 0, duration: 10 };
  const withAudio = { ...publicOf(single), audio: { duration: 10, clip } };

  it('with a stage open, says where the sound plays and sends replay and stop', async () => {
    const send = show(during('question', single, { question: withAudio }));
    expect(screen.getByText('🎵 Звук грає на сцені')).toBeTruthy();
    expect(document.querySelector('.audio-card')).toBeNull();
    fireEvent.click(button('Програти ще раз'));
    fireEvent.click(button('Стоп'));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:audio', { action: 'stop' }));
    expect(send).toHaveBeenCalledWith('host:audio', { action: 'replay' });
  });

  it('without a stage, plays the clip itself', () => {
    render(
      <HostScreen view={during('question', single, { question: withAudio })} code="123456" stageUrl="x" joinUrl="y" send={vi.fn(async () => ({ ok: true as const }))} stageOnline={false} />,
    );
    expect(screen.getByText('🎵 Сцена не відкрита — звук грає тут')).toBeTruthy();
    expect(document.querySelector('.audio-card')).not.toBeNull();
  });

  it('a short stage drop does not start local sound; a lasting one does', () => {
    vi.useFakeTimers();
    try {
      const props = { code: '123456', stageUrl: 'x', joinUrl: 'y', send: vi.fn(async () => ({ ok: true as const })) };
      const quick = during('question', single, { question: withAudio });
      const { rerender } = render(<HostScreen view={quick} {...props} stageOnline />);
      rerender(<HostScreen view={quick} {...props} stageOnline={false} />);
      expect(screen.getByText('🎵 Звук грає на сцені')).toBeTruthy();
      expect(document.querySelector('.audio-card')).toBeNull();
      act(() => void vi.advanceTimersByTime(1000));
      rerender(<HostScreen view={quick} {...props} stageOnline />);
      act(() => void vi.advanceTimersByTime(5000));
      rerender(<HostScreen view={quick} {...props} stageOnline={false} />);
      act(() => void vi.advanceTimersByTime(3100));
      expect(screen.getByText('🎵 Сцена не відкрита — звук грає тут')).toBeTruthy();
      expect(document.querySelector('.audio-card')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('without a stage and past the clip, offers replay but does not start the sound', () => {
    const late = during('question', single, { question: withAudio, limitMs: 20_000, endsAt: Date.now() + 5000 });
    render(<HostScreen view={late} code="123456" stageUrl="x" joinUrl="y" send={vi.fn(async () => ({ ok: true as const }))} stageOnline={false} />);
    expect(document.querySelector('.audio-card')?.getAttribute('data-state')).toBe('stopped');
    expect(button('Програти ще раз')).toBeTruthy();
  });

  it('shows a revealing picture whole, with a tag', () => {
    const revealing = { ...publicOf(single), imageUrl: '/uploads/a.png', reveal: 'pixels' as const };
    show(during('question', single, { question: revealing }));
    expect(document.querySelector('img.question-image')).not.toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.querySelector('.reveal-tag')?.textContent).toContain('Проявляється з пікселів');
  });

  it('the context line has ⓘ for the audio and the revealing picture; pressing them sends nothing', () => {
    const both = { ...publicOf(single), imageUrl: '/uploads/a.png', reveal: 'blur' as const, audio: { duration: 10, clip } };
    const send = show(during('question', single, { question: both, round: { index: 0, total: 1, title: 'Розминка', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null } }));
    const context = document.querySelector('.host-context') as HTMLElement;
    fireEvent.click(within(context).getByRole('button', { name: 'Довідка: Аудіо до запитання' }));
    screen.getByRole('dialog', { name: 'Аудіо до запитання' });
    fireEvent.click(within(context).getByRole('button', { name: 'Довідка: Картинка, що проявляється' }));
    screen.getByRole('dialog', { name: 'Картинка, що проявляється' });
    expect(send).not.toHaveBeenCalled();
  });

  it('shows the slider scale during the question', () => {
    const sliderFull: Question = { id: 'q3', type: 'slider', text: 'Скільки?', imageUrl: null, video: null, timeLimit: 20, points: 1000, min: 0, max: 100, step: 1, correct: 50, tolerance: 2, unit: '%' };
    const question = { ...publicOf(sliderFull), slider: { min: 0, max: 100, step: 1, unit: '%' } };
    show(during('question', sliderFull, { question, sliderMarks: [{ playerId: 'p1', nickname: 'Олена', value: 40, points: 0 }] }));
    expect(document.querySelector('.slider-scale')).not.toBeNull();
    expect(screen.getByLabelText('Олена: 40 %')).toBeTruthy();
  });
});

describe('HostScreen clues and pin (10c)', () => {
  const cluesFull: Question = { id: 'q4', type: 'clues', text: 'Хто я?', imageUrl: null, video: null, timeLimit: 60, points: 1000, clues: ['Перша', 'Друга', 'Третя', 'Четверта', 'П’ята'], accepted: ['Шевченко'], interval: 8 };
  const cluesOf = (shown: number, over: { byHost?: boolean; nextAt?: number | null } = {}) => ({
    ...publicOf(cluesFull),
    clues: { total: 5, shown: cluesFull.clues.slice(0, shown), nextAt: over.nextAt ?? null, byHost: over.byHost ?? false, intervalSeconds: 8, self: false, opens: null },
  });

  it('lists every clue with the opened ones marked and no open button in a classic round', () => {
    show(during('question', cluesFull, { question: cluesOf(2, { nextAt: Date.now() + 5000 }) }));
    const panel = document.querySelector('.host-clues') as HTMLElement;
    expect(panel.querySelectorAll('li')).toHaveLength(5);
    expect(within(panel).getByText('Четверта')).toBeTruthy();
    expect(within(panel).getAllByText('відкрито')).toHaveLength(2);
    expect(within(panel).getAllByText(/^за \d+ с$/).length).toBeGreaterThan(0);
    expect(within(panel).getByText('Відкрито 2 з 5: правильна відповідь зараз — 80 % ціни')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Відкрити підказку/ })).toBeNull();
  });

  it('shows the unopened clues as paused, not closed, while the clock is stopped, and disables the voice-cell button', () => {
    show(during('question', cluesFull, { paused: true, question: cluesOf(2) }));
    const panel = document.querySelector('.host-clues') as HTMLElement;
    expect(within(panel).getAllByText('пауза')).toHaveLength(3);
    expect(within(panel).queryByText('закрито')).toBeNull();
    cleanup();
    show(during('reveal', cluesFull, { question: cluesOf(2) }));
    expect(within(document.querySelector('.host-clues') as HTMLElement).getAllByText('закрито')).toHaveLength(3);
    cleanup();
    show(during('question', cluesFull, { paused: true, question: cluesOf(2, { byHost: true }) }));
    expect(button('Відкрити підказку 3').disabled).toBe(true);
  });

  it('names the clue each answer was given on', () => {
    show(
      during('reveal', cluesFull, {
        question: cluesOf(5),
        responses: [{ playerId: 'p1', nickname: 'Олена', answer: { type: 'clues', value: 'Шевченко' }, timeMs: 4000, accepted: true, grade: 'correct' as const, streakBonus: 0, points: 800, overridden: false, buff: null, spare: null, clue: 2 }],
      }),
    );
    expect(screen.getByText('на підказці 2')).toBeTruthy();
  });

  it('opens the next clue on a voice cell and disables the button after the last one', () => {
    const send = show(during('question', cluesFull, { question: cluesOf(2, { byHost: true }) }));
    fireEvent.click(button('Відкрити підказку 3'));
    expect(send).toHaveBeenCalledWith('host:clue', undefined);
    cleanup();
    show(during('question', cluesFull, { question: cluesOf(5, { byHost: true }) }));
    expect(screen.queryByRole('button', { name: /Відкрити підказку/ })).toBeNull();
    expect((button('Усі підказки відкрито')).disabled).toBe(true);
  });

  it('shows live pins and the target with the circles during the question', () => {
    const pinFull: Question = { id: 'q5', type: 'pin', text: 'Де?', imageUrl: null, video: null, timeLimit: 20, points: 1000, map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
    const question = { ...publicOf(pinFull), pin: { map: 'world' as const, aspect: 2 } };
    show(during('question', pinFull, { question, pinMarks: [{ playerId: 'p1', nickname: 'Олена', x: 0.4, y: 0.4, points: 0 }] }));
    expect(document.querySelectorAll('.host-pin .pin-mark')).toHaveLength(1);
    expect(document.querySelector('.host-pin .pin-target')).not.toBeNull();
    expect(document.querySelectorAll('.host-pin svg.pin-layer circle')).toHaveLength(2);
  });

  it('an own picture of a pin is drawn once, by the pin board, not as a question image', () => {
    const img = `/uploads/${'b'.repeat(32)}.png`;
    const pinOwn: Question = { id: 'q6', type: 'pin', text: 'Де?', imageUrl: img, video: null, timeLimit: 20, points: 1000, map: null, aspect: 1.5, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
    show(during('question', pinOwn, { question: { ...publicOf(pinOwn), imageUrl: img, pin: { map: null, aspect: 1.5 } }, pinMarks: [] }));
    expect(document.querySelector('img.question-image')).toBeNull();
    expect(document.querySelectorAll(`.host-pin img[src="${img}"]`)).toHaveLength(1);
  });

  it('has a help button on the clue panel and on the pin map that sends nothing', () => {
    const send = show(during('question', cluesFull, { question: cluesOf(2, { nextAt: Date.now() + 5000 }) }));
    fireEvent.click(within(document.querySelector('.host-clues') as HTMLElement).getByRole('button', { name: 'Довідка: Хто я?' }));
    expect(send).not.toHaveBeenCalled();
    cleanup();
    const pinFull: Question = { id: 'q5', type: 'pin', text: 'Де?', imageUrl: null, video: null, timeLimit: 20, points: 1000, map: 'world', aspect: 2, target: { x: 0.5, y: 0.5 }, fullRadius: 3, zeroRadius: 15 };
    const sendPin = show(during('question', pinFull, { question: { ...publicOf(pinFull), pin: { map: 'world' as const, aspect: 2 } }, pinMarks: [] }));
    fireEvent.click(within(document.querySelector('.host-pin') as HTMLElement).getByRole('button', { name: 'Довідка: Точка на мапі' }));
    expect(sendPin).not.toHaveBeenCalled();
  });
});

describe('HostScreen: wall, poll and word cloud (10d)', () => {
  const names = ['Річки', 'Міста', 'Гори', 'Озера'];
  const wallQ: Question = {
    id: 'w1',
    type: 'wall',
    text: 'Знайдіть групи',
    imageUrl: null,
    video: null,
    timeLimit: 90,
    points: 1000,
    mistakes: 3,
    groups: names.map((name, g) => ({ id: `g${g}`, name, tiles: [0, 1, 2, 3].map((n) => ({ id: `t${g}${n}`, text: `${name}${n}` })) })),
  };
  const pollOptions = [
    { id: 'a', text: 'Весна' },
    { id: 'b', text: 'Літо' },
  ];
  const pollQ: Question = { id: 'p1', type: 'poll', text: 'Яка пора найкраща?', imageUrl: null, video: null, timeLimit: 20, points: 0, options: pollOptions };
  const cloudQ: Question = { id: 'c1', type: 'wordcloud', text: 'З чим асоціюється Київ?', imageUrl: null, video: null, timeLimit: 30, points: 0, words: 3 };
  const vote = (playerId: string, nickname: string, answer: Answer) => ({
    playerId,
    nickname,
    answer,
    timeMs: 1000,
    accepted: null,
    grade: null,
    streakBonus: 0,
    points: 0,
    overridden: false,
    buff: null,
    spare: null,
    clue: null,
  });

  it('the wall shows the groups with names and the live table, with no grading buttons', () => {
    show(
      during('question', wallQ, {
        question: { ...publicOf(wallQ), wall: { tiles: [], size: 4, groupCount: 4, maxMistakes: 3 } },
        wall: { groupCount: 4, rows: [{ playerId: 'p1', nickname: 'Олена', found: 2, mistakes: 1, locked: false, solved: false, points: null, tiles: [[0, 1, 2, 3]] }] },
      }),
    );
    const panel = document.querySelector('.host-wall') as HTMLElement;
    for (const name of names) expect(within(panel).getByText(name)).toBeTruthy();
    expect(within(panel).getByText('Олена')).toBeTruthy();
    expect(within(panel).getByText('2 / 4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Неправильно' })).toBeNull();
  });

  it('a wall cell on the board shows no grade buttons and no correct-answer line in the reveal', () => {
    const boardRound: RoundInfo = { index: 0, total: 1, title: 'Поле', type: 'board', partial: true, description: '', brief: emptyBrief('board'), times: null };
    show(
      during('reveal', wallQ, {
        round: boardRound,
        question: { ...publicOf(wallQ), wall: { tiles: [], size: 4, groupCount: 4, maxMistakes: 3 } },
        wall: { groupCount: 4, rows: [] },
        board: {
          categories: [],
          order: [],
          turn: { playerId: 'p1', nickname: 'Олена' },
          cell: { id: 'c1', category: 'Міста', price: 100, mark: 'none', kind: 'normal', answerMode: 'phone', penalty: 'none' },
          dice: null,
          schedule: [],
          scheduleRepeats: false,
          skipAt: null,
          marks: [],
          marksHidden: false,
          manual: false,
          answer: null,
        },
      }),
    );
    for (const name of ['Зарахувати', 'Частково', 'Не зараховувати']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(document.querySelector('.answer')).toBeNull();
  });

  it('the poll shows live bars from the responses and the reveal button is Показати результати', () => {
    show(
      during('locked', pollQ, {
        question: { ...publicOf(pollQ), choices: pollOptions },
        responses: [vote('p1', 'Олена', { type: 'poll', optionId: 'b' }), vote('p2', 'Тарас', { type: 'poll', optionId: 'b' }), vote('p3', 'Віра', { type: 'poll', optionId: 'a' })],
      }),
    );
    expect(screen.getByText('67 % · 2')).toBeTruthy();
    expect(screen.getByText('33 % · 1')).toBeTruthy();
    expect(button('Показати результати')).toBeTruthy();
  });

  it('a vote row shows the answer but no verdict, no points and no grading buttons', () => {
    show(
      during('reveal', pollQ, {
        question: { ...publicOf(pollQ), choices: pollOptions },
        responses: [vote('p1', 'Олена', { type: 'poll', optionId: 'b' })],
      }),
    );
    const row = document.querySelector('.rows li') as HTMLElement;
    expect(within(row).getByText('Літо')).toBeTruthy();
    expect(row.querySelector('.tag')).toBeNull();
    expect(row.querySelector('.score')).toBeNull();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('a cloud vote row has no verdict mark either', () => {
    show(during('question', cloudQ, { responses: [vote('p1', 'Олена', { type: 'wordcloud', words: ['каштани', 'Дніпро'] })], cloud: [] }));
    const row = document.querySelector('.rows li') as HTMLElement;
    expect(within(row).getByText('каштани, Дніпро')).toBeTruthy();
    expect(row.querySelector('.tag')).toBeNull();
    expect(row.querySelector('.is-wrong, .is-correct')).toBeNull();
  });

  it('a tap on a cloud word hides it, a hidden word comes back with another tap', () => {
    const send = show(
      during('question', cloudQ, {
        cloud: [
          { key: 'каштани', text: 'каштани', count: 2, hidden: false, by: ['Олена', 'Тарас'] },
          { key: 'борщ', text: 'борщ', count: 1, hidden: true, by: ['Віра'] },
        ],
      }),
    );
    expect(screen.getByText('Торкніться слова, щоб сховати його з екрана. Ще дотик — повернути.')).toBeTruthy();
    fireEvent.click(button('каштани'));
    expect(send).toHaveBeenCalledWith('host:cloud-hide', { key: 'каштани', hidden: true });
    fireEvent.click(button('борщ'));
    expect(send).toHaveBeenCalledWith('host:cloud-hide', { key: 'борщ', hidden: false });
  });

  it('the wall, poll and cloud panels have ⓘ with their own entry; it sends nothing', () => {
    const wallSend = show(
      during('question', wallQ, {
        question: { ...publicOf(wallQ), wall: { tiles: [], size: 4, groupCount: 4, maxMistakes: 3 } },
        wall: { groupCount: 4, rows: [] },
      }),
    );
    const wallPanel = document.querySelector('.host-wall') as HTMLElement;
    fireEvent.click(within(wallPanel).getByRole('button', { name: "Довідка: Стіна зв'язків" }));
    expect(wallSend).not.toHaveBeenCalled();
    cleanup();
    const pollSend = show(during('locked', pollQ, { question: { ...publicOf(pollQ), choices: pollOptions }, responses: [] }));
    const pollPanel = document.querySelector('.host-poll') as HTMLElement;
    fireEvent.click(within(pollPanel).getByRole('button', { name: 'Довідка: Опитування' }));
    expect(pollSend).not.toHaveBeenCalled();
    cleanup();
    const cloudSend = show(during('question', cloudQ, { cloud: [] }));
    const cloudPanel = screen.getByRole('heading', { name: /Хмара слів/ }).closest('section') as HTMLElement;
    fireEvent.click(within(cloudPanel).getByRole('button', { name: 'Довідка: Хмара слів' }));
    expect(cloudSend).not.toHaveBeenCalled();
  });
});

describe('HostScreen: survey (10e)', () => {
  const surveyQ = { id: 's1', type: 'survey', text: 'Назвіть фрукт', imageUrl: null, video: null, timeLimit: 45, points: 1000, answers: 3, rows: [] } as unknown as Question;
  const texts = ['Яблуко', 'Банан', 'Полуниця', 'Кавун', 'Груша'];
  const board = (shown: number) => ({
    source: 'host' as const,
    total: 5,
    shown,
    rows: texts.map((text, at) => ({ rank: at + 1, open: at + 1 > 5 - shown, text, popularity: 30 - at, by: at === 0 ? ['Олена'] : [] })),
  });
  const surveyView = (phase: HostView['phase'], shown: number, over: Partial<HostView> = {}) =>
    during(phase, surveyQ, { survey: board(shown), ...over, question: { ...publicOf(surveyQ), survey: { answers: 3, rows: 5 } } });

  it('shows the whole board with popularity and live authors, and no grading buttons', () => {
    show(surveyView('question', 0));
    expect(screen.getByText('Яблуко')).toBeTruthy();
    expect(document.querySelector('.host-survey .survey-by')?.textContent).toBe('Олена');
    expect(screen.getByText('Ваша дошка')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
    expect(screen.queryByText(/Правильна відповідь/)).toBeNull();
  });

  it('the main button opens the next row, the second button opens all, and when all are open it is «Далі»', () => {
    const send = show(surveyView('reveal', 1));
    fireEvent.click(button('Відкрити рядок 2 з 5'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    cleanup();
    const sendAll = show(surveyView('reveal', 1));
    fireEvent.click(button('Відкрити всі'));
    expect(sendAll).toHaveBeenCalledWith('host:survey-all', undefined);
    cleanup();
    show(surveyView('reveal', 5));
    expect(button('Далі')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
  });

  it('while paused there are no row buttons', () => {
    show(surveyView('reveal', 1, { paused: true }));
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Відкрити рядок/ })).toBeNull();
  });

  it('has a help button on the survey panel that sends nothing', () => {
    const send = show(surveyView('question', 0));
    fireEvent.click(within(document.querySelector('.host-survey') as HTMLElement).getByRole('button', { name: 'Довідка: 100 до 1' }));
    expect(send).not.toHaveBeenCalled();
    screen.getByRole('dialog', { name: '100 до 1' });
  });

  it('warns about a skipped survey', () => {
    show(view({ phase: 'intro', surveySkipped: ['Що ви назвали про Київ?'] }));
    expect(screen.getByText('Запитання «Що ви назвали про Київ?» пропущено: хмара не дала слів, а запасних рядків немає.')).toBeTruthy();
  });

  it('both row buttons wait for the pace window (11b)', () => {
    const now = Date.now();
    show(surveyView('reveal', 1, { pace: { next: { from: now - 100, until: now + 1000 }, lock: null, skip: null } }));
    expect(button('Відкрити рядок 2 з 5').disabled).toBe(true);
    expect(button('Відкрити всі').disabled).toBe(true);
    expect(button('Відкрити всі').className).toContain('is-pacing');
    expect(button('Відкрити всі').getAttribute('aria-busy')).toBe('true');
  });
});

describe('HostScreen: bluff (10f)', () => {
  const bluffQ = { id: 'bl1', type: 'bluff', text: 'Вежу хотіли поставити в …', imageUrl: null, video: null, timeLimit: 60, points: 1000, accepted: ['Барселона'], lies: ['Мілан', 'Лісабон'], choiceTime: 30 } as unknown as Question;
  const opt = (id: string, text: string, over: Partial<BluffOptionView> = {}): BluffOptionView => ({ id, text, open: false, kind: 'lie', authors: ['Олена'], pickedBy: [], removed: false, ...over });
  const bluff = (over: Partial<BluffInfo> = {}): BluffInfo => ({ stage: 'lies', written: 1, picked: 0, options: [], shown: 0, total: 0, lastOpenedId: null, lies: [{ nickname: 'Олена', text: 'Рим' }], ...over });
  const five = [opt('b1', 'Рим'), opt('b2', 'Мілан', { kind: 'spare', authors: [] }), opt('b3', 'Париж'), opt('b4', 'Барселона', { kind: 'truth', authors: [] }), opt('b5', 'Лісабон', { kind: 'spare', authors: [] })];
  const bluffView = (phase: HostView['phase'], info: BluffInfo, over: Partial<HostView> = {}) => during(phase, bluffQ, { bluff: info, ...over });

  it('«Відкрити всі» waits for the pace window (11b)', () => {
    const now = Date.now();
    const info = bluff({ stage: 'reveal', options: five.map((o, at) => ({ ...o, open: at < 1 })), shown: 1, total: 5, lies: null });
    show(bluffView('reveal', info, { pace: { next: { from: now - 100, until: now + 1000 }, lock: null, skip: null } }));
    expect(button('Відкрити всі').disabled).toBe(true);
    expect(button('Відкрити всі').className).toContain('is-pacing');
    expect(button('Відкрити всі').title).toBe('Ще мить: гравці мають побачити екран.');
    expect(button('Відкрити варіант 2 з 5').disabled).toBe(true);
  });

  it('the bluff help button sits once, in the context line, and sends nothing', () => {
    const send = show(bluffView('question', bluff(), { round: { index: 0, total: 1, title: '', type: 'classic' } as unknown as HostView['round'] }));
    const helps = screen.getAllByRole('button', { name: 'Довідка: Блеф' });
    expect(helps).toHaveLength(1);
    fireEvent.click(helps[0]);
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector('.host-bluff h2')).toBeNull();
  });

  it('locked: no «Прибрати» (the engine refuses outside the question)', () => {
    show(bluffView('locked', bluff({ stage: 'choice', options: five, total: 5, lies: null })));
    expect(screen.queryByRole('button', { name: /^Прибрати/ })).toBeNull();
  });

  it('the choice timer ignores the audio lead of a long clip: no «Слухайте»', () => {
    const q = { ...publicOf(bluffQ), audio: { duration: 100, clip: { source: 'file', url: '/uploads/abcdef0123456789.mp3', start: 0, duration: 100 } } };
    show(bluffView('question', bluff({ stage: 'choice', options: five, total: 5, lies: null }), { question: q as unknown as HostView['question'], limitMs: 30_000, remainingMs: 28_000, endsAt: null }));
    expect(screen.queryByText('🎵 Слухайте')).toBeNull();
  });

  it('lies phase: live lies with authors, the main button goes to the choice', () => {
    const send = show(bluffView('question', bluff()));
    expect(screen.getByText('Олена: Рим')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
    expect(screen.queryByText(/Правильна відповідь/)).toBeNull();
    fireEvent.click(button('До вибору'));
    expect(send).toHaveBeenCalledWith('host:lock', undefined);
  });

  it('choice phase: «Закрити вибір», and «Прибрати» only next to players lies, after confirming', () => {
    const send = show(bluffView('question', bluff({ stage: 'choice', options: five, total: 5, lies: null })));
    expect(button('Закрити вибір')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Прибрати/ })).toHaveLength(2);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: /^Прибрати/ })[0]);
    expect(confirm).toHaveBeenCalledWith('Прибрати «Рим»? Автори нічого за неї не отримають.');
    expect(send).toHaveBeenCalledWith('host:bluff-remove', { optionId: 'b1' });
    confirm.mockRestore();
  });

  it('reveal: «Відкрити варіант 2 з 5» steps, «Відкрити всі» opens all, and when all are open it is «Далі»', () => {
    const info = (n: number) => bluff({ stage: 'reveal', options: five.map((o, at) => ({ ...o, open: at < n })), shown: n, total: 5, lies: null });
    const send = show(bluffView('reveal', info(1)));
    fireEvent.click(button('Відкрити варіант 2 з 5'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
    cleanup();
    const sendAll = show(bluffView('reveal', info(1)));
    fireEvent.click(button('Відкрити всі'));
    expect(sendAll).toHaveBeenCalledWith('host:bluff-all', undefined);
    cleanup();
    show(bluffView('reveal', info(5)));
    expect(button('Далі')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Правильно' })).toBeNull();
  });

  it('one guard for every bluff action: a second tap is ignored, and the main button is blocked while a remove is in flight', async () => {
    let release: () => void = () => undefined;
    const send = vi.fn(() => new Promise<{ ok: true }>((resolve) => (release = () => resolve({ ok: true }))));
    show(bluffView('question', bluff({ stage: 'choice', options: five, total: 5, lies: null })), send);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: /^Прибрати/ })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /^Прибрати/ })[1]);
    fireEvent.click(button('Закрити вибір'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(button('Закрити вибір').disabled).toBe(true);
    release();
    await waitFor(() => expect(button('Закрити вибір').disabled).toBe(false));
    confirm.mockRestore();
  });

  it('«Відкрити всі» is not sent twice by a double tap, and is absent while paused', () => {
    const open = five.map((o, at) => ({ ...o, open: at < 1 }));
    const info = bluff({ stage: 'reveal', options: open, shown: 1, total: 5, lies: null });
    const send = show(bluffView('reveal', info), vi.fn(() => new Promise<{ ok: true }>(() => undefined)));
    fireEvent.click(button('Відкрити всі'));
    fireEvent.click(button('Відкрити всі'));
    expect(send).toHaveBeenCalledTimes(1);
    cleanup();
    show(bluffView('reveal', info, { paused: true }));
    expect(screen.queryByRole('button', { name: 'Відкрити всі' })).toBeNull();
  });

  describe('wipeout', () => {
    const wRow = (id: string, nickname: string, over: Partial<WipeoutRow> = {}): WipeoutRow => ({ playerId: id, nickname, status: 'in', bank: 300, step: null, decision: null, choice: null, prev: null, ...over });
    const wInfo = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
      ladder: [100, 200, 300, 400, 500],
      current: 2,
      done: 3,
      rows: [wRow('p1', 'Олена', { decision: 'take' }), wRow('p2', 'Тарас', { decision: 'pending' })],
      inCount: 2,
      decide: { endsAt: Date.now() + 10_000, remainingMs: null, decided: 1, total: 2 },
      decisions: false,
      ...over,
    });
    const wRound: RoundInfo = { index: 0, total: 1, title: '', type: 'wipeout', partial: false, description: '', brief: emptyBrief('wipeout'), times: null };
    const noDebuffs = { debuffs: [], buffs: [] };

    it('the main button is disabled with a reason while players decide', () => {
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo(), allowed: noDebuffs }));
      expect(button(/Гравці вирішують… \d+ с/).disabled).toBe(true);
    });

    it('after the window closes the main button is «Наступне запитання»', () => {
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo({ decide: null }), allowed: noDebuffs }));
      expect(button('Наступне запитання').disabled).toBe(false);
    });

    it('nobody left in the game: «Підсумки раунду», and plain «Далі» when it is the last round', () => {
      show(view({ phase: 'leaderboard', round: { ...wRound, total: 2 }, wipeout: wInfo({ decide: null, inCount: 0, rows: [wRow('p1', 'Олена', { status: 'burned', bank: 0 })] }), allowed: noDebuffs }));
      expect(button('Підсумки раунду').disabled).toBe(false);
      cleanup();
      show(view({ phase: 'leaderboard', round: wRound, wipeout: wInfo({ decide: null, inCount: 0, rows: [wRow('p1', 'Олена', { status: 'burned', bank: 0 })] }), allowed: noDebuffs }));
      expect(screen.queryByRole('button', { name: 'Підсумки раунду' })).toBeNull();
      expect(button('Далі').disabled).toBe(false);
    });

    it('«Відповіли N з M» counts only the players still in the game', () => {
      show(during('question', single, { round: wRound, answeredCount: 1, wipeout: wInfo({ decide: null, inCount: 1, current: 0, done: 0 }), allowed: noDebuffs }));
      expect(screen.getByText(/Відповіли 1 з 1/)).toBeTruthy();
    });

    it('no debuff menu on a wipeout question', () => {
      show(during('question', single, { round: wRound, wipeout: wInfo({ decide: null }), allowed: noDebuffs }));
      expect(screen.queryAllByRole('button', { name: t('debuff') })).toHaveLength(0);
      expect(screen.getAllByRole('button', { name: t('points') }).length).toBeGreaterThan(0);
    });

    it('a text answer on the reveal can be accepted or rejected, never «partly»', () => {
      show(during('reveal', textQuestion, { round: wRound, wipeout: wInfo({ decide: null }), allowed: noDebuffs, responses: [{ playerId: 'p1', nickname: 'Олена', answer: { type: 'text', value: 'Одеса' }, timeMs: 4000, accepted: false, grade: 'wrong' as const, streakBonus: 0, points: 0, overridden: false, buff: null, spare: null, clue: null }] }));
      expect(screen.queryByRole('button', { name: /Частково/ })).toBeNull();
      expect(screen.getByRole('button', { name: t('accept') })).toBeTruthy();
    });
  });

  describe('survival', () => {
    const sRow = (id: string, nickname: string, over: Partial<SurvivalRow> = {}): SurvivalRow => ({ playerId: id, nickname, status: 'alive', outAfter: null, ghost: null, answer: null, trial: null, door: null, ...over });
    const sInfo = (over: Partial<SurvivalInfo> = {}): SurvivalInfo => ({
      current: 1,
      total: 5,
      target: 1,
      bonus: 500,
      trialKind: 'luck',
      trialsLeft: 0,
      rows: [sRow('p1', 'Олена', { status: 'edge', trial: 'pending' }), sRow('p2', 'Тарас', { status: 'ghost', outAfter: 1 })],
      aliveCount: 1,
      ghostCount: 1,
      ghosts: { answered: 0, right: null },
      verdict: 'trial',
      trial: { kind: 'luck', fellBack: false, stage: 'open', endsAt: Date.now() + 10_000, remainingMs: null, limitMs: 10_000, done: 0, total: 1, question: null, reveal: null },
      ending: false,
      ...over,
    });
    const sRound: RoundInfo = { index: 0, total: 1, title: '', type: 'survival', partial: false, description: '', brief: emptyBrief('survival'), times: null };
    const closedTrial = { kind: 'luck' as const, fellBack: false, stage: 'closed' as const, endsAt: null, remainingMs: null, limitMs: 10_000, done: 1, total: 1, question: null, reveal: null };

    it('the main button closes an open trial', () => {
      const send = show(view({ phase: 'leaderboard', round: sRound, survival: sInfo() }));
      fireEvent.click(button('Закрити випробування'));
      expect(send).toHaveBeenCalledWith('host:next', undefined);
    });

    it('after the trial: «Наступне запитання»; when the round ends «Підсумки раунду» (plain «Далі» in the last round)', () => {
      const closed = sInfo({ trial: closedTrial });
      show(view({ phase: 'leaderboard', round: { ...sRound, total: 2 }, survival: closed }));
      expect(button('Наступне запитання')).toBeTruthy();
      cleanup();
      show(view({ phase: 'leaderboard', round: { ...sRound, total: 2 }, survival: { ...closed, ending: true } }));
      expect(button('Підсумки раунду')).toBeTruthy();
      cleanup();
      show(view({ phase: 'leaderboard', round: sRound, survival: { ...closed, ending: true } }));
      expect(screen.queryByRole('button', { name: 'Підсумки раунду' })).toBeNull();
      expect(button('Далі')).toBeTruthy();
    });

    it('«Відповіли N з M» counts the alive', () => {
      show(during('question', single, { round: sRound, answeredCount: 1, playerCount: 2, survival: sInfo({ trial: null, verdict: null, aliveCount: 3 }) }));
      expect(screen.getByText(/Відповіли 1 з 3/)).toBeTruthy();
    });

    it('a ghost gets no debuff button, a living player does', () => {
      show(view({ phase: 'leaderboard', round: sRound, survival: sInfo() }));
      expect(screen.getAllByRole('button', { name: t('debuff') })).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: t('points') })).toHaveLength(2);
    });
  });

  describe('ladder', () => {
    const lRound: RoundInfo = { index: 0, total: 2, title: '', type: 'ladder', partial: false, description: '', brief: emptyBrief('ladder'), times: null };
    const lPlayers = [
      { id: 'p1', nickname: 'Олена', connected: true, score: 0, streak: 0, debuff: null },
      { id: 'p2', nickname: 'Петро', connected: true, score: 0, streak: 0, debuff: null },
      { id: 'p3', nickname: 'Тарас', connected: false, score: 0, streak: 0, debuff: null },
    ];
    const lView = (over: Partial<HostView>) => view({ round: lRound, players: lPlayers, ...over });

    it('intro with pick «host» and nobody picked: the main button is disabled «Виберіть учасника»', () => {
      show(lView({ phase: 'intro', ladder: ladderInfo({ contestant: null, pick: 'host', current: -1 }) }));
      expect(button('Виберіть учасника').disabled).toBe(true);
    });

    it('intro with random or lowest: «Вибрати учасника» sends next', () => {
      const send = show(lView({ phase: 'intro', ladder: ladderInfo({ contestant: null, pick: 'random', current: -1 }) }));
      const draw = button('Вибрати учасника');
      expect(draw.disabled).toBe(false);
      fireEvent.click(draw);
      expect(send).toHaveBeenCalledWith('host:next', undefined);
    });

    it('intro with a contestant: «Почати драбину»', () => {
      show(lView({ phase: 'intro', ladder: ladderInfo({ current: -1 }) }));
      expect(button('Почати драбину').disabled).toBe(false);
    });

    it('leaderboard: «Учасник вирішує…» is disabled while the decision is open', () => {
      show(lView({ phase: 'leaderboard', ladder: ladderInfo({ decision: 'pending' }) }));
      expect(button('Учасник вирішує…').disabled).toBe(true);
    });

    it('leaderboard with an outcome: «Підсумки раунду», plain «Далі» in the last round', () => {
      const done = ladderInfo({ decision: null, outcome: { kind: 'took', passed: 2, points: 300 } });
      show(lView({ phase: 'leaderboard', ladder: done }));
      expect(button('Підсумки раунду')).toBeTruthy();
      cleanup();
      show(lView({ phase: 'leaderboard', round: { ...lRound, total: 1 }, ladder: done }));
      expect(screen.queryByRole('button', { name: 'Підсумки раунду' })).toBeNull();
      expect(button('Далі')).toBeTruthy();
    });

    it('leaderboard with the next question open (decision go): «Наступне запитання»', () => {
      show(lView({ phase: 'leaderboard', ladder: ladderInfo({ decision: 'go' }) }));
      expect(button('Наступне запитання')).toBeTruthy();
    });

    it('no debuff buttons next to the players in the ladder round', () => {
      // Рушій у «Мільйонері» віддає порожній allowed.debuffs (debuffsOff): меню біля гравців не з'являється.
      show(lView({ phase: 'leaderboard', allowed: { debuffs: [], buffs: [] }, ladder: ladderInfo({ decision: 'pending' }) }));
      expect(screen.queryAllByRole('button', { name: t('debuff') })).toHaveLength(0);
      expect(screen.getAllByRole('button', { name: t('points') })).toHaveLength(3);
    });
  });

  describe('teams', () => {
    const teamLobby = (over: Partial<HostView> = {}) => view({ players: [], playerCount: 0, teams: teamsView(), ...over });
    const unassigned = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, nickname: `Гість${i}`, connected: true }));
    const alone = teamsView({ teams: teamsView().teams.map((team, i) => (i === 0 ? { ...team, members: [], captainId: null } : { ...team, members: team.members.slice(0, 1) })) });

    it('the team lobby shows the host team form and no plain player list', () => {
      show(teamLobby());
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(document.querySelector('.host-team-cols')).not.toBeNull();
      expect(document.querySelector('ul.rows')).toBeNull();
    });

    it('«Почати гру» is off with fewer than two people and on with two', () => {
      show(teamLobby({ teams: alone }));
      expect(button(t('start')).disabled).toBe(true);
      cleanup();
      show(teamLobby());
      expect(button(t('start')).disabled).toBe(false);
    });

    it('«Почати гру» is off when everyone sits in one team and nobody is left to deal', () => {
      const one = teamsView({ teams: teamsView().teams.map((team, i) => (i === 0 ? { ...team, members: [], captainId: null } : team)) });
      show(teamLobby({ teams: one }));
      expect(button(t('start')).disabled).toBe(true);
      expect(screen.getByText(t('teamStartFew'))).toBeTruthy();
    });

    it('«Почати гру» is on when the unassigned fill the empty team', () => {
      const one = teamsView({
        teams: teamsView().teams.map((team, i) => (i === 0 ? { ...team, members: [], captainId: null } : team)),
        unassigned: unassigned(1),
      });
      show(teamLobby({ teams: one }));
      expect(button(t('start')).disabled).toBe(false);
    });

    it('the lobby kicks a member with the host:kick event', () => {
      const send = vi.fn(async () => ({ ok: true as const }));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      show(teamLobby(), send);
      fireEvent.click(screen.getByRole('button', { name: 'Вилучити: Петро' }));
      expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'u3' });
    });

    it('«Почати гру» waits for an open dice round', () => {
      const dice = { rows: [{ playerId: 'u1', nickname: 'Іра', throws: [], waiting: true }], tieBreak: false, done: false };
      show(teamLobby({ teams: teamsView({ form: 'dice', dice }) }));
      expect(button(t('start')).disabled).toBe(true);
    });

    it('hints how many people will be dealt at the start', () => {
      show(teamLobby({ teams: teamsView({ unassigned: unassigned(1) }) }));
      expect(screen.getByText('Без команди: 1 — розподілимо при старті')).toBeTruthy();
    });

    it('in the game the people stand under their team with a crown, «Капітан» and «Вилучити»', async () => {
      const send = vi.fn(async () => ({ ok: true as const }));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      show(
        view({
          phase: 'leaderboard',
          teams: teamsView(),
          players: [
            { id: 'team-a', nickname: 'Червоні', connected: true, score: 100, streak: 0, debuff: null },
            { id: 'team-b', nickname: 'Сині', connected: true, score: 200, streak: 0, debuff: null },
          ],
        }),
        send,
      );
      // «Вилучити» лише біля людей: четверо, біля команд — немає.
      expect(screen.getAllByRole('button', { name: /^Вилучити: / })).toHaveLength(4);
      expect(screen.queryByRole('button', { name: 'Вилучити' })).toBeNull();
      expect(document.querySelectorAll('.player-row .captain-mark')).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: 'Вилучити: Петро' }));
      expect(send).toHaveBeenCalledWith('host:kick', { playerId: 'u3' });
      // Пока відповідь не прийшла, другий дотик не йде.
      expect((screen.getByRole('button', { name: 'Капітан: Петро' }) as HTMLButtonElement).disabled).toBe(true);
      await waitFor(() => expect((screen.getByRole('button', { name: 'Капітан: Петро' }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole('button', { name: 'Капітан: Петро' }));
      expect(send).toHaveBeenCalledWith('host:captain', { teamId: 'team-b', memberId: 'u3' });
    });
  });
});

describe('HostScreen: pacing (11b)', () => {
  const T = 2_000_000;
  const paced = (phase: HostView['phase'], pace: HostView['pace']) => during(phase, single, { pace });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('the main button is disabled and filling while the window runs, with the same label', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    const send = show(paced('reveal', { next: { from: T - 500, until: T + 1500 }, lock: null, skip: null }));
    const next = button('Далі');
    expect(next.disabled).toBe(true);
    expect(next.className).toContain('is-pacing');
    expect(Number(next.style.getPropertyValue('--pace'))).toBeCloseTo(500 / 2100, 2);
    expect(next.title).toBe('Ще мить: гравці мають побачити екран.');
    expect(next.getAttribute('aria-busy')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(1599);
    });
    expect(button('Далі').disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(button('Далі').disabled).toBe(false);
    expect(button('Далі').className).not.toContain('is-pacing');
    expect(button('Далі').title).toBe('');
    expect(button('Далі').hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(button('Далі'));
    expect(send).toHaveBeenCalledWith('host:next', undefined);
  });

  it('the close button follows the lock window, not the next one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    show(paced('question', { next: null, lock: { from: T, until: T + 3000 }, skip: null }));
    const close = button('Закрити запитання');
    expect(close.disabled).toBe(true);
    expect(close.className).toContain('is-pacing');
    cleanup();
    show(paced('question', { next: { from: T, until: T + 3000 }, lock: null, skip: null }));
    expect(button('Закрити запитання').disabled).toBe(false);
  });

  it('a too_soon answer shows no error, another one does', async () => {
    const soon = vi.fn(async () => ({ ok: false as const, error: 'too_soon' as const }));
    show(paced('reveal', { next: null, lock: null, skip: null }), soon);
    fireEvent.click(button('Далі'));
    await waitFor(() => expect(soon).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    const wrong = vi.fn(async () => ({ ok: false as const, error: 'wrong_phase' as const }));
    show(paced('reveal', { next: null, lock: null, skip: null }), wrong);
    fireEvent.click(button('Далі'));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('HostScreen: live answers (11c)', () => {
  const lrow = (over: Partial<LiveRow> = {}): LiveRow => ({
    id: 'p1',
    nickname: 'Олена',
    connected: true,
    answered: true,
    answer: { type: 'text', value: 'Одеса' },
    timeMs: 4000,
    verdict: 'correct',
    awaiting: false,
    buff: null,
    spare: null,
    clue: null,
    actor: null,
    progress: null,
    wager: null,
    ...over,
  });
  const lrows = [lrow(), lrow({ id: 'p2', nickname: 'Тарас', answered: false, answer: null, timeMs: null, verdict: null })];
  const liveOf = (over: Partial<HostLive> = {}): HostLive => ({ kind: 'answers', answered: 1, total: 2, rows: lrows, aside: null, ...over });
  const withLive = (phase: HostView['phase'], q: Question, over: Partial<HostView> = {}, liveOver: Partial<HostLive> = {}) =>
    during(phase, q, { endsAt: Date.now() + 20_000, answeredCount: 1, live: liveOf(liveOver), ...over });
  const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const otherPanels = () => Array.from(document.querySelectorAll('section.panel')).filter((el) => !el.querySelector('h1.question') && !el.classList.contains('live-answers'));
  const bluffRound: RoundInfo = { index: 0, total: 1, title: '', type: 'classic', partial: false, description: '', brief: emptyBrief('classic'), times: null };

  it('the panel stands first under the question and the timer, and the plain responses step aside', () => {
    show(withLive('question', textQuestion));
    const panel = document.getElementById('live-answers') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByRole('heading', { name: 'Відповіді наживо' })).toBeTruthy();
    expect(before(document.querySelector('.host-time') as Element, panel)).toBe(true);
    for (const other of otherPanels()) expect(before(panel, other)).toBe(true);
    expect(screen.queryByRole('heading', { name: 'Відповіді' })).toBeNull();
    cleanup();
    show(during('question', textQuestion, { endsAt: Date.now() + 20_000 }));
    expect(document.getElementById('live-answers')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Відповіді' })).toBeTruthy();
  });

  it('the answered counter is a button that scrolls to the panel; without it, plain text', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    show(withLive('question', textQuestion));
    fireEvent.click(button('До відповідей наживо'));
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(document.getElementById('live-answers'));
    cleanup();
    show(during('question', textQuestion, { endsAt: Date.now() + 20_000, answeredCount: 1 }));
    expect(screen.queryByRole('button', { name: 'До відповідей наживо' })).toBeNull();
    expect(screen.getByText(/Відповіли 1 з 2/)).toBeTruthy();
  });

  it('the chain and sort panels step aside while the panel is up, and return without it', () => {
    const chainQ: Question = { id: 'q3', type: 'chain', text: 'Ланцюжок', imageUrl: null, video: null, timeLimit: 20, points: 1000, words: ['Форель', 'Риба'], hintSeconds: 5 };
    const chain = { total: 1, rows: [{ playerId: 'p1', nickname: 'Олена', solved: 1, hints: 1, timeMs: 8000, points: null }] };
    const chainView = { question: { ...publicOf(single), type: 'chain' as const, choices: [], chain: { first: 'Форель', masks: [['Р', null, null, null]], hintSeconds: 5 } }, chain };
    show(withLive('question', chainQ, chainView));
    expect(screen.queryByRole('heading', { name: 'Ланцюжок' })).toBeNull();
    cleanup();
    show(withLive('reveal', chainQ, { ...chainView, live: null }));
    expect(screen.getByRole('heading', { name: 'Ланцюжок' })).toBeTruthy();
    cleanup();
    const categories = [
      { id: 'c1', text: 'Овочі' },
      { id: 'c2', text: 'Фрукти' },
    ];
    const sortQ: Question = {
      id: 'q4',
      type: 'sort',
      text: 'Розкладіть',
      imageUrl: null,
      video: null,
      timeLimit: 60,
      points: 100,
      lockSeconds: 3,
      categories,
      words: [
        { id: 'w1', text: 'Морква', categoryId: 'c1' },
        { id: 'w2', text: 'Яблуко', categoryId: 'c2' },
      ],
    };
    const sort = { total: 2, winner: null, words: null, live: null, rows: [{ playerId: 'p1', nickname: 'Олена', sorted: 1, misses: 0, timeMs: null, points: null }] };
    const sortView = { question: { ...publicOf(single), type: 'sort' as const, choices: [], sort: { categories, total: 2, lockSeconds: 3 } }, sort };
    show(withLive('question', sortQ, sortView));
    expect(screen.queryByRole('heading', { name: 'Сортування' })).toBeNull();
    cleanup();
    show(withLive('reveal', sortQ, { ...sortView, live: null }));
    expect(screen.getByRole('heading', { name: 'Сортування' })).toBeTruthy();
  });

  it('an instant blitz has the queue inside the panel and no second one', () => {
    const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
    const rows = [
      { playerId: 'p1', nickname: 'Олена', timeMs: 1200, grade: 'wrong' as const, answer: { type: 'text' as const, value: 'Одеса' } },
      { playerId: 'p2', nickname: 'Тарас', timeMs: 2500, grade: null, answer: { type: 'text' as const, value: 'Київ' } },
    ];
    const blitz = { voice: false, manual: false, winner: null, instant: true, rows, queue: [], attempts: [] };
    show(withLive('question', textQuestion, { round, blitz, answeredCount: 2 }, { kind: 'blitz', answered: 2 }));
    const panel = document.getElementById('live-answers') as HTMLElement;
    expect(panel.querySelectorAll('.blitz-queue')).toHaveLength(1);
    expect(document.querySelectorAll('.blitz-queue')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Черга' })).toBeNull();
  });

  it('a button blitz has the judge buttons inside the panel', async () => {
    const round: RoundInfo = { index: 0, total: 1, title: '', type: 'blitz', partial: false, description: '', brief: emptyBrief('blitz'), times: null };
    const blitz = {
      voice: true,
      manual: true,
      winner: null,
      instant: false,
      rows: [],
      queue: [{ playerId: 'p1', nickname: 'Олена', answer: null, deadline: null }],
      attempts: [],
    };
    const send = show(withLive('question', textQuestion, { round, blitz }, { kind: 'blitz', answered: 1 }));
    const panel = document.getElementById('live-answers') as HTMLElement;
    fireEvent.click(within(panel).getByRole('button', { name: 'Правильно' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:judge', { playerId: 'p1', correct: true }));
    expect(screen.getAllByRole('button', { name: 'Правильно' })).toHaveLength(1);
  });

  const sRound: RoundInfo = { index: 0, total: 1, title: '', type: 'survival', partial: false, description: '', brief: emptyBrief('survival'), times: null };
  const trialSurvival = (): SurvivalInfo => ({
    current: 1,
    total: 5,
    target: 1,
    bonus: 500,
    trialKind: 'luck',
    trialsLeft: 0,
    rows: [{ playerId: 'p1', nickname: 'Олена', status: 'edge', outAfter: null, ghost: null, answer: null, trial: 'pending', door: null }],
    aliveCount: 1,
    ghostCount: 0,
    ghosts: { answered: 0, right: null },
    verdict: 'trial',
    trial: { kind: 'luck', fellBack: false, stage: 'open', endsAt: Date.now() + 10_000, remainingMs: null, limitMs: 10_000, done: 0, total: 1, question: null, reveal: null },
    ending: false,
  });

  it('the survival trial gets the panel before the survival panel', () => {
    show(view({ phase: 'leaderboard', round: sRound, survival: trialSurvival(), live: liveOf({ kind: 'trial' }) }));
    const panel = document.getElementById('live-answers') as HTMLElement;
    expect(before(panel, document.querySelector('.host-survival') as Element)).toBe(true);
  });

  it('the open trial shows only drafts of a trial batch (12b)', () => {
    const shown = view({ phase: 'leaderboard', round: sRound, survival: trialSurvival(), live: liveOf({ kind: 'trial' }) });
    const batch = (trial: boolean) => ({ questionIndex: shown.questionIndex, trial, drafts: [{ id: 'p2', draft: { type: 'text' as const, value: 'Оде' }, changes: 0, at: Date.now() }] });
    const props = { view: shown, code: '123456', stageUrl: 'http://quiz.test/stage/123456#s', joinUrl: 'http://quiz.test/play/123456', send: vi.fn(async () => ({ ok: true as const })) };
    render(<HostScreen {...props} drafts={batch(true)} />);
    expect(document.querySelector('#live-answers .live-draft em')?.textContent).toBe('друкує «Оде»');
    cleanup();
    render(<HostScreen {...props} drafts={batch(false)} />);
    expect(document.querySelector('.live-draft')).toBeNull();
  });

  it('the open trial keeps the previous question responses in place', () => {
    show(during('leaderboard', textQuestion, { round: sRound, survival: trialSurvival(), live: null }));
    expect(screen.getByRole('heading', { name: 'Відповіді' })).toBeTruthy();
    cleanup();
    show(during('leaderboard', textQuestion, { round: sRound, survival: trialSurvival(), live: liveOf({ kind: 'trial' }) }));
    expect(document.getElementById('live-answers')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Відповіді' })).toBeTruthy();
  });

  it('the final wager stage has no live panel', () => {
    void bluffRound;
    show(view({ phase: 'wager', round: { ...bluffRound, type: 'final' }, live: null }));
    expect(document.getElementById('live-answers')).toBeNull();
  });

  it('a duel shows the live rows in the duel panel instead of the try texts', () => {
    const duelLive = liveOf({
      kind: 'duel',
      rows: [
        lrow({ answered: false, answer: null, progress: { kind: 'duel', tries: ['Варшава'], won: null } }),
        lrow({ id: 'p2', nickname: 'Петро', answered: false, answer: null, progress: { kind: 'duel', tries: [], won: null } }),
      ],
    });
    show(view({ phase: 'duel', round: bluffRound, duel: hostDuel(), live: duelLive }));
    const panel = document.querySelector('.duel-host') as HTMLElement;
    expect(within(panel).getByText(/Варшава/)).toBeTruthy();
    expect(within(panel).queryByText('Спроби Петро: Львів, Ліон')).toBeNull();
    expect(document.getElementById('live-answers')).toBeNull();
  });
});

describe('undo button (12a)', () => {
  it('stands in the header on the leaderboard and opens the undo sheet', () => {
    show(view({ phase: 'leaderboard', questionIndex: 0, undo: { rounds: [] } }));
    const button = within(document.querySelector('header.bar') as HTMLElement).getByRole('button', { name: '↶ Бали' });
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Скасування балів' })).toBeTruthy();
  });

  it('is not there in the lobby or after the end', () => {
    show(view());
    expect(screen.queryByRole('button', { name: '↶ Бали' })).toBeNull();
    cleanup();
    show(view({ phase: 'finished', questionIndex: 1, standings: [] }));
    expect(screen.queryByRole('button', { name: '↶ Бали' })).toBeNull();
  });
});

describe('«👁 Наживо» toggle (12b)', () => {
  const lrow = (over: Partial<LiveRow> = {}): LiveRow => ({
    id: 'p2',
    nickname: 'Тарас',
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
    ...over,
  });
  const rows = [lrow({ id: 'p1', nickname: 'Олена', answered: true, answer: { type: 'text', value: 'Одеса' }, verdict: 'correct' }), lrow()];
  const live: HostLive = { kind: 'answers', answered: 1, total: 2, rows, aside: null };
  const current = (over: Partial<HostView> = {}) => during('question', textQuestion, { endsAt: Date.now() + 20_000, answeredCount: 1, live, ...over });
  const batch = (questionIndex: number) => ({ questionIndex, trial: false, drafts: [{ id: 'p2', draft: { type: 'text' as const, value: 'Оде' }, changes: 0, at: Date.now() }] });
  const showWith = (shown: HostView, props: { watch?: boolean; onWatch?: (on: boolean) => void; drafts?: ReturnType<typeof batch> | null } = {}) =>
    render(<HostScreen view={shown} code="123456" stageUrl="http://quiz.test/stage/123456#s" joinUrl="http://quiz.test/play/123456" send={vi.fn(async () => ({ ok: true as const }))} {...props} />);
  const toggle = () => within(document.querySelector('header.bar') as HTMLElement).queryByRole('button', { name: 'Наживо' }) as HTMLButtonElement | null;

  it('stands in the header on a question, on by default, and a tap turns it off', () => {
    const onWatch = vi.fn();
    showWith(current(), { onWatch, drafts: batch(0) });
    const button = toggle() as HTMLButtonElement;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toBe('👁 Наживо');
    expect(button.title).toBe('Показувати, що гравці вибирають до «Надіслати»');
    expect(document.querySelector('.live-draft em')?.textContent).toBe('друкує «Оде»');
    fireEvent.click(button);
    expect(onWatch).toHaveBeenCalledWith(false);
  });

  it('off, it is not pressed and the panel folds to the count', () => {
    const onWatch = vi.fn();
    showWith(current(), { watch: false, onWatch, drafts: null });
    expect(toggle()?.getAttribute('aria-pressed')).toBe('false');
    const panel = document.getElementById('live-answers') as HTMLElement;
    expect(panel.classList.contains('is-collapsed')).toBe(true);
    expect(within(panel).getByText('Відповіли 1 з 2')).toBeTruthy();
    expect(panel.querySelector('.live-row')).toBeNull();
    fireEvent.click(toggle() as HTMLButtonElement);
    expect(onWatch).toHaveBeenCalledWith(true);
  });

  it('is not there in the lobby or after the end', () => {
    showWith(view());
    expect(toggle()).toBeNull();
    cleanup();
    showWith(view({ phase: 'finished', questionIndex: 1, standings: [] }));
    expect(toggle()).toBeNull();
  });

  it('a batch of another question shows no draft', () => {
    showWith(current(), { drafts: batch(1) });
    expect(document.querySelector('.live-draft')).toBeNull();
  });
});
